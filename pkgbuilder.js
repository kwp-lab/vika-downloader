
const fs = require('fs')
const path = require('path')
const Axios = require('axios')
const Vika = require('@vikadata/vika').default

var inquirer = require('inquirer')

var appConfig = {
    isDebug: true,
    userToken: "",
    datasheetUrl: "",
    datasheetId: "",
    viewId: "",
    attachmentField: "",
    host: "https://api.vika.cn/fusion/v1"
}

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
            message: '从哪个维格表中读取数据，请粘贴URL：',
            default: appConfig.datasheetUrl ? appConfig.datasheetUrl : null
        },
        {
            type: 'input',
            name: 'attachmentField',
            message: '附件所在的列名称',
            default: appConfig.attachmentField ? appConfig.attachmentField : null
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
    var pathStr = path.resolve(output, attachment_name.substr(0, pos) + extension)

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

/**
 * 获取不重复的唯一文件名称
 */
function getUnionFilename(attachment, existedFilenames){
    var attachment_name = attachment.name
    var pos = attachment_name.lastIndexOf('?')
    if(pos>=0){
        attachment_name = attachment_name.substr(0, pos)
    }
    

    pos = attachment_name.lastIndexOf('.')

    if(pos>=0){
        var extension = attachment_name.substr(pos)
        var attachment_basename = attachment_name.substr(0, pos) + extension
    }else if(attachment.mimeType == "image/jpeg"){
        var extension = ".jpg"
        var attachment_basename = attachment_name + extension
    }
    
    if (existedFilenames.indexOf(attachment_basename)>-1) {

        for(var i=1; i<9999; i++){
            attachment_basename = attachment_name.substr(0, pos) + "_" + i + extension
            if (existedFilenames.indexOf(attachment_basename) == -1) {
                break;
            }
        }   
    }

    existedFilenames.push(attachment_basename)
    return attachment_basename
}

function getFloat(number, n) {
	n = n ? parseInt(n) : 0;
	if(n <= 0) {
		return Math.round(number);
	}
	number = Math.round(number * Math.pow(10, n)) / Math.pow(10, n); //四舍五入
	number = Number(number).toFixed(n); //补足位数
	return number;
}

async function downloadImage(attachment, unionFilename) {
    const path = validateFilePath(outputPath, unionFilename, attachment.mimeType)

    const writer = fs.createWriteStream(path)
    let counter = 0;
    let bytesWrittenLastTime = 0;

    const intervalFlag = setInterval(()=>{
        if( (writer.bytesWritten > bytesWrittenLastTime) || (attachment.size == writer.bytesWritten) ){
            bytesWrittenLastTime = writer.bytesWritten
        }else{
            console.log(`[${counter}]下载数据缓慢，已写入${getFloat(writer.bytesWritten/1024/1024, 4)}MB: ${path}`)
            counter++
        }
        
        if(counter>20){
            console.log("!!!\n[文件下载失败]"+path+"\n\n")
            clearInterval(intervalFlag)
            writer.close()
            process.exit(1)
        }
    },2000)

    return await Axios({
        url: attachment.url,
        method: 'GET',
        responseType: 'stream'
    }).then( async(response) => {
        
        
        response.data.pipe(writer)
        await new Promise((resolve, reject) => {
            
            writer.on('open', ()=>{
                //console.log("下载开始："+ path)
            })
            writer.on('finish', ()=>{
                clearInterval(intervalFlag)
                console.log("下载成功："+ path)
                resolve()
            })
            writer.on('error', ()=>{
                console.log("文件无法保存到本地："+ path)
                resolve() //忽略此错误，跳过
            })
        })
    }).catch(function (error) {
        console.log("无法下载此文件："+path)
        console.log(error)
        clearInterval(intervalFlag)
    })
}

async function download(attachments){
    var tmp = [];
    var attachmentUnionNames = []
    console.log("attachmentUnionNames", attachmentUnionNames)
    for(var i=0; i<attachments.length; i++){
        tmp.push(attachments[i])
        if(i>1 && i%5==0){
            console.log(`正在下载附件[${i-4} 至 ${i}]`)
            const results = tmp.map(async(attachment, index) =>{
                try {
                    const unionFilename = getUnionFilename(attachment, attachmentUnionNames)
                    console.log(`文件${index+1}： ${unionFilename}`)
                    return await downloadImage(attachment, unionFilename)
                } catch (error) {
                    console.log("ee", error)
                    return Promise.reject()
                }
            })

            await Promise.all(results)

            tmp.length = 0
        }
    }

    if(tmp.length>0){
        console.log(`正在下载附件`)
        const results2 = tmp.map(async(attachment) =>{
            const unionFilename = getUnionFilename(attachment, attachmentUnionNames)
            console.log("开始下一个文件：" + unionFilename)
            return await downloadImage(attachment, unionFilename)
        })

        await Promise.all(results2)
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

    Vika.auth({ token: appConfig.userToken, host: appConfig.host });

    await downloadAttachmentsBySteps(param)

    console.log("下载完成!")
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
