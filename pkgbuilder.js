
const fs = require('fs')
const path = require('path')
const Axios = require('axios')
const Vika = require('@vikadata/vika').default

var inquirer = require('inquirer');
const { listenerCount } = require('events');

console.log(`
***************************************************
        _ _             _       _        
       (_) |           | |     | |       
 __   ___| | ____ _  __| | __ _| |_ __ _ 
 \\ \\ / / | |/ / _\` |/ _\` |/ _\` | __/ _\` |
  \\ V /| |   < (_| | (_| | (_| | || (_| |
   \\_/ |_|_|\\_\\__,_|\\__,_|\\__,_|\\__\\__,_|

    维格表附件批量下载器 v1.0.1
    ☆维格实验室出品☆

***************************************************
`)



// 获取当前脚本的所在路径
var toolRootPath = process.cwd()
//console.log("toolRootPath", toolRootPath)

// 判断是否运行在pkg环境里
var inPKG = process.pkg ? true : false


var outputPath = inPKG ? path.resolve(toolRootPath, "output") : path.resolve(toolRootPath, "output")

console.log("附件将会保存至此路径："+outputPath+"\n")

function createDefaultFolder(){

    if( !fs.existsSync(outputPath) ){
        fs.mkdirSync(outputPath)
    }
}


var validateUserToken = async function(input){
    return new Promise(function(resolve, reject){
        if("" == input){
            reject("用户令牌不能为空");
        }else if(input.length !== 23){
            reject("用户令牌的长度不正确");
        }else{
            resolve(true)
        }
        
    })
}

var validateDatasheetUrl = async function(input){
    return new Promise(function(resolve, reject){
        if(input.startWith)

        if("" == input){
            reject("用户令牌不能为空");
        }else if(input.length !== 23){
            reject("用户令牌的长度不正确");
        }else{
            resolve(true)
        }
        
    })
}



/**
 * 初始化交互问题列表
 */
function initQuestions(appConfig){

    return [
        {
            type: 'input',
            name: 'datasheetUrl',
            message: '从哪个维格表中读取数据，请粘贴URL：'
        },
        {
            type: 'input',
            name: 'attachmentField',
            message: '附件所在的列名称'
        },
        {
            type: 'input',
            name: 'userToken',
            message: '请填写你的维格表API Token(用户中心页面可获得)：',
            validate: validateUserToken,
            default: appConfig.userToken ? appConfig.userToken : null
        },
    ]
}

function validateFilePath(output, attachment_name, mimeType){
    //console.log("validateFilePath", {output, attachment_name, mimeType})

    var pos = attachment_name.lastIndexOf('?')
    if(pos>=0){
        attachment_name = attachment_name.substr(0, pos)
    }
    

    pos = attachment_name.lastIndexOf('.')

    if(pos>=0){
        var extension = attachment_name.substr(pos)
    }else if(mimeType == "image/jpeg"){
        var extension = ".jpg"
    }
    var pathStr = path.resolve(output, attachment_name + extension)

    if (fs.existsSync(pathStr)) {
        
        var attachment_basename = attachment_name.substr(0, pos)
        

        for(var i=1; i<9999; i++){
            pathStr = path.resolve(output, attachment_basename + "_" + i + extension)
            if (!fs.existsSync(pathStr)) {
                break;
            }
        }   
    }

    return pathStr
}

async function downloadImage(attachment) {

    const path = validateFilePath(outputPath, attachment.name, attachment.mimeType)

    const writer = fs.createWriteStream(path)

    const response = await Axios({
        url: attachment.url,
        method: 'GET',
        responseType: 'stream'
    })

    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on('finish', ()=>{
            console.log("下载成功："+ path)
            resolve()
        })
        writer.on('error', reject)
    })
}

async function download(attachments){
    var tmp = [];
    for(var i=0; i<attachments.length; i++){
        tmp.push(attachments[i])
        if(i>1 && i%10==0){
            console.log(`正在下载附件[${i-8} 至 ${i+1}]`)
            var results = tmp.map(item =>{
                return downloadImage(item)
            })

            await Promise.all(results)

            tmp.length = 0
        }
    }

    if(tmp.length>0){
        console.log(`正在下载附件`)
        var results = tmp.map(item =>{
            return downloadImage(item)
        })

        await Promise.all(results)
    }

    return Promise.resolve("OK")
}

async function downloadAttachmentsBySteps(param){
    console.log(`正在获取记录 [pageNum: ${param.pageNum}, pageSize: ${param.pageSize}]`)
    return await Vika.datasheet(appConfig.datasheetId)
        .get(param)
        .then(response => {
            if (response.success) {
                
                var records = response.data.records;
                var attachments = []
                var total = response.data.total;
                var currentPageNum = response.data.pageNum;
                var pageTotal = Math.ceil(total / param.pageSize)

                for(var record of records){
                    if(record.fields[appConfig.attachmentField]){
                        attachments.push.apply(attachments, record.fields[appConfig.attachmentField])
                    }
                }

                //console.log({response, attachments});

                return download(attachments).then(res => {
                    //console.log({pageTotal, currentPageNum, param})
                    if(pageTotal>currentPageNum){
                        param.pageNum = currentPageNum + 1
                        return downloadAttachmentsBySteps(param)
                    }else{
                        return Promise.resolve("OK")
                    }
                })

                
            } else {
                console.error(response);
            }
        });
}

function getVikaURLParams(url){
    // https://vika.cn/workbench/dst3e6tbgFqpDZKob1/viwNxpfrZpP9K/rec90P9XvnQvE

    var keyword = "workbench/"
    var pos1 = url.indexOf(keyword)
    var sub = url.substr(pos1+keyword.length)
    return sub.split("/") 
}

async function run() {

    var tt = getVikaURLParams(appConfig.datasheetUrl)
    appConfig.datasheetId = tt[0]
    appConfig.viewId = tt[1]

    var param = {
        pageNum: 1,
        pageSize: 10,
        viewId: tt[1]
    }


    // 创建output文件夹
    createDefaultFolder()

    Vika.auth({ token: appConfig.userToken });

    await downloadAttachmentsBySteps(param)

    console.log("下载完成!")
}


// 缺省情况下的默认配置
var appConfig = {
    isDebug: true,
    userToken: "",
    datasheetUrl: "",
    datasheetId: "",
    viewId: ""
}

var questions = initQuestions(appConfig)

async function askquestion(){

    await inquirer
    .prompt(questions)
    .then(async (answers) => {
        // Use user feedback for... whatever!!
        console.log("answers", answers)
        appConfig.userToken = answers.userToken
        appConfig.datasheetUrl = answers.datasheetUrl
        appConfig.attachmentField = answers.attachmentField
        await run()

        await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'nextRound',
                message: '下一步要做什么呢？',
                choices: ["继续下载", "退出"]
            },
        ]).then(answers => {
            //console.log("answers 2", answers)
            if(answers.nextRound=="继续下载"){
                questions = initQuestions(appConfig)
                return askquestion()
            }
        })
    })
    .catch(error => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });
}

stopAndExit = false

askquestion()
