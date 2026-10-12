// Transcribed from the user's final report and 9x9 initial/final map images.
const report='[0号]宽容\n【第 1 回合】\n[↑掩盖[啪嗒]]←(←撞)\n【第 2 回合】\n↑→←(↑撞)\n【第 3 回合】\n→↑↑[→掩盖[啪嗒]]↓[↓啪嗒]←(↑撞)\n[1号]奇策十二\n【第 1 回合】\n[↓掩盖[啪嗒]]↓[→啪嗒][↑掩盖[啪嗒]](↑撞)\n【第 2 回合】\n←↑↓↓←←←↓↓(↓撞)\n【第 3 回合】\n←←[←啪嗒]←[←啪嗒]↓[↑掩盖[啪嗒]]←[←啪嗒]←(↑撞)(捕捉)';
const messages=['玩家人数：2','模式幻变','我是0号','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','【开局】\n空空墙空','【第 1 回合】\n空墙墙空','【第 2 回合】\n墙空空空','本局有心脏',report].map((text,i)=>({id:String(i),view:0,text}));
const layout=['5','E6','47','45','23','51','48','50','14'].map((id,i)=>({id,origin:{r:Math.floor(i/3)*3,c:i%3*3}}));
const births=[{r:7,c:8},{r:4,c:2}],ends=[{r:5,c:1},{r:5,c:1}];
module.exports={report,messages,layout,births,ends};
