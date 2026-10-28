// OCR_TEST_RUNTIME debe apuntar al entorno temporal de pruebas con tesseract.js.
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const runtime=process.env.OCR_TEST_RUNTIME||path.join(os.homedir(),'AppData','Local','Temp','botellas-ocr-pruebas');
const {createWorker}=require(path.join(runtime,'node_modules/tesseract.js'));
(async()=>{
 const {leerTSV,volumenesTexto}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'js/texto-producto.js'))).toString('base64'));
 const worker=await createWorker('eng',1,{langPath:path.join(root,'vendor/ocr'),cachePath:os.tmpdir()});
 await worker.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'150'});
 try{for(const file of process.argv.slice(2)){
  const textos=[];
  for(const modo of ['color','claro','oscuro']){
   const py="from PIL import Image,ImageOps,ImageChops\nimport sys,io\nim=Image.open(sys.argv[1]).convert('RGB');mask=ImageChops.difference(im,Image.new('RGB',im.size,'white')).convert('L').point(lambda v:255 if v>25 else 0);bb=mask.getbbox();im=im.crop(bb) if bb else im\nw,h=im.size;rows=[]\nfor y in range(h):\n vals=[im.getpixel((x,y)) for x in range(w//10,w-w//10,max(1,w//80))];rows.append(sum(1 for p in vals if max(p)>45 and (max(p)-min(p))/max(p)>.25)/max(1,len(vals)))\nn=max(1,int(h*.20));top=max(range(int(h*.2),max(int(h*.2)+1,int(h*.82)-n)),key=lambda y:sum(rows[y:y+n]));im=im.crop((0,max(0,top-int(h*.04)),w,min(h,top+n+int(h*.04))));im=im.resize((1200,max(1,int(im.height*1200/im.width))))\nif sys.argv[2]=='claro':im=ImageOps.grayscale(im).point(lambda v:0 if v>190 else 255)\nif sys.argv[2]=='oscuro':im=im.getchannel('G').point(lambda v:0 if v<130 else 255)\nim=ImageOps.expand(im,border=30,fill='white');b=io.BytesIO();im.save(b,format='PNG');sys.stdout.buffer.write(b.getvalue())";
   const r=spawnSync('python',['-c',py,file,modo],{maxBuffer:15000000});if(r.status)throw new Error(r.stderr.toString());
   for(const psm of ['11','6']){await worker.setParameters({tessedit_pageseg_mode:psm,user_defined_dpi:psm==='11'?'0':'150'});const {data}=await worker.recognize(r.stdout,{}, {text:true,tsv:true});textos.push(leerTSV(data.tsv));}
  }
  const texto=textos.join(' ');console.log(JSON.stringify({archivo:path.basename(file),texto,volumenes:volumenesTexto(texto)}));
 }}finally{await worker.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1});
