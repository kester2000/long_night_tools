const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),T=require('../team'),j=require('./fixtures/garden-no-buttons.json');
function build(messages=j.messages){
 const b=M.build(j.base,messages),nodes=b.views.map(v=>{const r=E.replay(v.model.segments[0],9);return {id:v.id+':0',observations:r.observations,solution:E.solveMap(v.model.config,r.observations)};});
 return {b,team:{nodes},questions:T.extraInformationQuestions(b.model.config,{nodes},b)};
}
test('garden archive proactively requests public extra information for both relevant rounds',()=>{
 const {questions}=build();assert.deepEqual(questions.map(q=>q.round),[1,2]);
 const {b,team}=build();assert.deepEqual(T.extraInformationQuestions({...b.model.config,dynamicDoors:false},team,b),[]);
 for(const n of team.nodes)n.solution.phases=[];assert.deepEqual(T.extraInformationQuestions(b.model.config,team,b),[]);
});
test('negative public confirmation constrains only its own round and undo restores questions',()=>{
 const ms=[...j.messages,{id:'no',view:1,text:'【第 1 回合】\n确认本回合无额外信息'}],{b,questions}=build(ms);
 assert.deepEqual(b.model.config.buttonCounts,{1:0});assert(!questions.some(q=>q.round===1));
 assert(build().questions.some(q=>q.round===1));
 assert.deepEqual(build([...ms,{id:'no2',view:1,text:'【第 2 回合】\n确认本回合无额外信息'}]).questions,[]);
});
test('complete extra information uses a positive door count or confirms its absence',()=>{
 const message=text=>[...j.messages,{id:'extra',view:1,text:'【第 2 回合】\n【本回合完整额外信息】\n'+text}];
 assert.deepEqual(build(message('门曾被按钮触发，共发生 2 次变化')).b.model.config.buttonCounts,{2:2});
 const b=build(message('1号获得1枚金币')).b;assert.deepEqual(b.model.config.buttonCounts,{2:0});assert.equal(b.model.config.coinGains[0].min,1);
 assert.deepEqual(build([...j.messages,{id:'coin',view:1,text:'【第 2 回合】\n1号获得1枚金币'}]).b.model.config.buttonCounts,{});
});
test('incomplete public round does not request a not-yet-issued announcement',()=>{
 const ms=j.messages.filter(m=>!m.text.startsWith('[0号]'));
 assert.deepEqual(build(ms).questions,[]);
 const {b,team}=build();b.views[0].roundEnds.forEach(e=>e.complete=false);
 assert.deepEqual(T.extraInformationQuestions(b.model.config,team,b),[]);
 b.spectator=true;b.views[0].roundEnds.forEach(e=>e.complete=true);
 assert(T.extraInformationQuestions(b.model.config,team,b).length,'public questions also apply to spectators and silent games');
});
