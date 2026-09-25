import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
 const page = await browser.newPage(); await page.goto('http://localhost:5370')
 const results = await page.evaluate(async () => {
  const { defaultGraphDocument } = await import('/src/lib/graphDocument.ts')
  const { restoreGraphCanvas } = await import('/src/canvas/graphCanvas.ts')
  const { buildStyle } = await import('/src/canvas/graphStyle.ts')
  const { queryGraph, analyzeGraph } = await import('/src/lib/graphExplore.ts')
  const { layoutGraphAsync } = await import('/src/lib/graphLayoutAsync.ts')
  const { default: cytoscape } = await import('/node_modules/.vite/puregraph/deps/cytoscape.js')
  const result = []
  for (const size of [250, 1000]) {
   const doc = {...defaultGraphDocument(), elements:[...Array.from({length:size},(_,i)=>({data:{id:`n${i}`,label:`Node ${i}`,score:i},position:{x:(i%40)*100,y:Math.floor(i/40)*80}})),...Array.from({length:size*6},(_,i)=>({data:{id:`e${i}`,source:`n${i%size}`,target:`n${(i%size+Math.floor(i/size)*17+1)%size}`}}))]}
   const container = document.createElement('div'); Object.assign(container.style,{width:'1100px',height:'800px'});document.body.append(container)
   const cy = cytoscape({container,style:buildStyle(doc.style),elements:[]})
   try {
    const start=performance.now();restoreGraphCanvas(cy,doc);const renderMs=performance.now()-start
    const queryStart=performance.now();queryGraph(doc.elements,{query:`Node ${size-1}`});analyzeGraph(doc.elements,{operation:'path',start:'n0',end:`n${size-1}`,directed:true});const queryAndPathMs=performance.now()-queryStart
    let ticks=0;const interval=setInterval(()=>ticks++,10);const layoutStart=performance.now();await layoutGraphAsync(doc,'grid');const workerGridMs=performance.now()-layoutStart;clearInterval(interval)
    const editStart=performance.now();doc.elements[0].data.label='Changed label';restoreGraphCanvas(cy,doc,false);const editMs=performance.now()-editStart
    result.push({nodes:size,edges:size*6,renderMs:Math.round(renderMs),editMs:Math.round(editMs),queryAndPathMs:Math.round(queryAndPathMs),workerGridMs:Math.round(workerGridMs),mainThreadTicksDuringLayout:ticks})
   }finally{cy.destroy();container.remove()}
  }
  return result
 })
 await writeFile('/tmp/puregraph-benchmark.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results))
}finally{await browser.close()}
