importScripts('blocks.js','timeline.js','engine.js','messages.js','local.js','team.js','hypotheses.js');
self.onmessage=({data})=>{
  try{self.postMessage({id:data.id,progress:{stage:'hypotheses'}});const hypotheses=data.notebook?LongNightHypotheses.all(data.config,data.notebook):[],resolved=hypotheses.filter(h=>h.resolvedChoices);if(resolved.length){self.postMessage({id:data.id,resolvedChoices:{...data.notebook.choices,...Object.fromEntries(resolved.map(h=>[h.player,h.resolvedChoices]))}});return;}const team=LongNightTeam.solve(data.config,data.nodes,data.relations,local=>self.postMessage({id:data.id,local}),progress=>self.postMessage({id:data.id,progress}));team.hypotheses=hypotheses;self.postMessage({id:data.id,team});}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
