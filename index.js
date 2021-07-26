
// 命令行参数配置
var argv = require('yargs')
    .option('d', { alias: 'datasheet', demand: true, describe: '维格表ID', type: 'string' })
    .option('v', { alias: 'view', demand: false, describe: '视图ID', type: 'string' })
    .option('o', { alias: 'output', demand: true, describe: '保存目标文件夹', type: 'string' })
    .option('t', { alias: 'token', demand: true, describe: '维格表用户Token', type: 'string' })
    .option('f', { alias: 'fieldname', demand: false, default: '附件', describe: '附件所在的列名称', type: 'string' })
    .option('pagesize', { demand: true, default: 10, describe: '分页读取条数', type: 'number' })
    .usage('Usage: node index [options]')
    .example('node index -d datasheetId -v viewId -f attachmentFieldname -t userToken -o /tmp', '下载指定维格表某视图下的所有附件')
    .help('h')
    .alias('h', 'help')
    .argv;


console.log('hello ', argv);

const fs = require('fs')
const Path = require('path')
const Axios = require('axios')
const Vika = require('@vikadata/vika').default;
const { listenerCount } = require('process');

function validateFilePath(output, attachment_name, mimeType){
    console.log("validateFilePath", {output, attachment_name, mimeType})

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
    var path = Path.resolve(output, attachment_name + extension)

    if (fs.existsSync(path)) {
        
        var attachment_basename = attachment_name.substr(0, pos)
        

        for(var i=1; i<9999; i++){
            path = Path.resolve(output, attachment_basename + "_" + i + extension)
            if (!fs.existsSync(path)) {
                break;
            }
        }   
    }

    return path
}

async function downloadImage(attachment) {

    const path = validateFilePath(argv.output, attachment.name, attachment.mimeType)

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
    return await Vika.datasheet(argv.datasheet)
        .get(param)
        .then(response => {
            if (response.success) {
                
                var records = response.data.records;
                var attachments = []
                var total = response.data.total;
                var currentPageNum = response.data.pageNum;
                var pageTotal = Math.ceil(total / param.pageSize)

                for(var record of records){
                    if(record.fields[argv.fieldname]){
                        attachments.push.apply(attachments, record.fields[argv.fieldname])
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

async function run() {
    var filepath = argv.output;
    var param = {
        pageNum: 1,
        pageSize: argv.pagesize,
    }

    if(argv.view){
        param.viewId = argv.view
    }

    if (!fs.existsSync(filepath)) {
        fs.mkdirSync(filepath);
    }

    Vika.auth({ token: argv.token });

    await downloadAttachmentsBySteps(param)

    console.log("下载完成!")
}

run();