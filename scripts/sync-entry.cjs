const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'));
if(process.argv.includes('--check')){
  if(!source.equals(fs.readFileSync(path.join(root,'chat.html')))){console.error('chat.html 与 index.html 不一致，请运行 npm run sync-entry。');process.exitCode=1;}
}else fs.writeFileSync(path.join(root,'chat.html'),source);
