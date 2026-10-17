importScripts('blocks.js','timeline.js','engine.js','messages.js','local.js','team.js','hypotheses.js','sound-candidates.js','route-explanations.js','search-cache.js','inference.js','example-search.js');
self.onmessage=async({data})=>{
 if(data.kind==='example'){
  try{self.postMessage({id:data.id,proof:await LongNightExampleSearch.cachedSearch(data.notebook,data.referenceId,data.request||{},progress=>self.postMessage({id:data.id,progress}),30000,data.cacheVersion)});}
  catch(error){self.postMessage({id:data.id,error:error.message});}
  return;
 }
 try{const team=await LongNightInference.run(data,message=>self.postMessage({id:data.id,...message}));self.postMessage({id:data.id,team});}
 catch(error){self.postMessage({id:data.id,error:error.message});}
 finally{LongNight.setDeadline();}
};
