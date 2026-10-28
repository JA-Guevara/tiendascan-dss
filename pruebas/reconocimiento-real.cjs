// Ejecutar: node pruebas/reconocimiento-real.cjs foto1 foto2 [controles...]
const fs=require('fs'),path=require('path'),vm=require('vm'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),tf=require(path.join(root,'vendor/tf.min.js'));
function io(dir){const j=JSON.parse(fs.readFileSync(path.join(dir,'model.json'))),b=Buffer.concat(j.weightsManifest.flatMap(g=>g.paths.map(p=>fs.readFileSync(path.join(dir,p)))));return tf.io.fromMemory({modelTopology:j.modelTopology,weightSpecs:j.weightsManifest.flatMap(g=>g.weights),weightData:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});}
const cos=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)/Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
(async()=>{
 const {regionEtiqueta,colorEtiqueta,evaluarComparacion}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'js/etiqueta.js'))).toString('base64'));
 await tf.setBackend('cpu');const graph=await tf.loadGraphModel(io(path.join(root,'modelo/detector')));const load=tf.loadGraphModel;tf.loadGraphModel=async()=>graph;
 const context={tf,console,setTimeout,clearTimeout,performance};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'vendor/coco-ssd.min.js'),'utf8'),context);const detector=await context.cocoSsd.load({base:'mobilenet_v2'});tf.loadGraphModel=load;
 const full=await tf.loadLayersModel(io(path.join(root,'modelo/identificador'))),model=tf.model({inputs:full.inputs,outputs:full.getLayer('conv_pw_13_relu').output});
 function vector(t){const out=tf.tidy(()=>model.predict(tf.image.resizeBilinear(t,[224,224]).div(127.5).sub(1).expandDims()).mean([1,2]).reshape([-1]));const a=Array.from(out.dataSync());out.dispose();return a;}
 const resultados=[];
 for(const file of process.argv.slice(2)){
  const py="from PIL import Image\nimport sys\nim=Image.open(sys.argv[1]).convert('RGB');im.thumbnail((640,640),Image.Resampling.BILINEAR)\nc=Image.new('RGB',(640,640),(238,241,246));c.paste(im,((640-im.width)//2,(640-im.height)//2));sys.stdout.buffer.write(c.tobytes())";
  const r=spawnSync('python',['-c',py,file],{maxBuffer:5000000});if(r.status||r.error)throw Error(r.stderr.toString()||r.error);
  const input=tf.tensor3d(new Int32Array(r.stdout),[640,640,3]);const cajas=(await detector.detect(input,20,.4)).filter(x=>x.class==='bottle');
  const imagen=tf.tidy(()=>{if(cajas.length!==1)return tf.image.resizeBilinear(input.toFloat(),[224,224]);const [x,y,w,h]=cajas[0].bbox,sx=Math.max(0,x-w*.05),sy=Math.max(0,y-h*.05),sw=Math.min(640-sx,w*1.1),sh=Math.min(640-sy,h*1.1);return tf.image.cropAndResize(input.toFloat().expandDims(),[[sy/640,sx/640,(sy+sh)/640,(sx+sw)/640]],[0],[224,224]).squeeze([0]);});input.dispose();
  const rgb=imagen.dataSync(),rgba=new Uint8Array(224*224*4);for(let i=0;i<224*224;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=255;}
  const roi=regionEtiqueta(rgba,224,224);const label=imagen.slice([roi.y,roi.x,0],[roi.h,roi.w,3]);
  const item={nombre:path.basename(file),completo:vector(imagen),etiqueta:vector(label),color:colorEtiqueta(rgba,224,roi),pixeles:Array.from(rgba),roi};const propio={envase:item.completo,etiqueta:item.etiqueta,color:item.color,pixeles:item.pixeles,visible:item.roi.visible};
  const identidad=evaluarComparacion(propio,propio,cos);if(!identidad.compatible||!identidad.mismaImagen)throw new Error('No reconoce su propia imagen: '+item.nombre);
  console.log('Identidad comprobada:',item.nombre);resultados.push(item);label.dispose();imagen.dispose();console.log(item.nombre,'botellas:',cajas.length,'etiqueta:',JSON.stringify(roi));
 }
 for(let i=1;i<resultados.length;i++){const a=resultados[0],b=resultados[i];const resultado=evaluarComparacion({envase:a.completo,etiqueta:a.etiqueta,color:a.color,visible:a.roi.visible},{envase:b.completo,etiqueta:b.etiqueta,color:b.color,visible:b.roi.visible},cos);console.log(JSON.stringify({referencia:a.nombre,consulta:b.nombre,...resultado,aceptado:resultado.compatible&&resultado.puntaje>=.8}));}
 model.dispose();detector.dispose();
})().catch(e=>{console.error(e);process.exitCode=1});
