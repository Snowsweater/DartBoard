const cameraIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/></svg>`;
const uploadIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/></svg>`;
const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 5 11 7-11 7z"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM14 5h4v14h-4z"/></svg>`;
const names = ['shoulder', 'elbow', 'wrist'];
const formatTime = n => Number.isFinite(n) ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '0:00';
const angleOf = points => {
  if (points.length !== 3) return null;
  const [a,b,c] = points.map(p=>({x:p.px??p.x,y:p.py??p.y})), ab = {x:a.x-b.x,y:a.y-b.y}, cb = {x:c.x-b.x,y:c.y-b.y};
  const den = Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y);
  return den > 0 ? Math.round(Math.acos(Math.max(-1,Math.min(1,(ab.x*cb.x+ab.y*cb.y)/den)))*180/Math.PI) : null;
};

/** Browser-local form review with optional general-purpose pose estimation. */
export function mountCoach(container) {
  let stopped = false, stream = null, raf = null, playing = false, detector = null, detectorPromise = null, detecting = false, cameraPending = false, cameraGeneration = 0;
  const urls = new Set();
  const cleanupListeners = [];
  const state = {
    you: {name:'Your throw', marks:[], mode:'empty', ready:false, naturalW:0, naturalH:0, revision:0},
    pro: {name:'Reference throw', marks:[], mode:'empty', ready:false, naturalW:0, naturalH:0, revision:0}
  };
  container.innerHTML = `
  <style>
  .coach-root [hidden]{display:none!important}.coach-root{--cc:#ed6845;--ci:#1f2927;--cm:#747c76;--cl:#dce7c1;color:var(--ci);font-size:14px}
  .coach-intro{display:flex;justify-content:space-between;gap:24px;margin-bottom:24px;align-items:center}.coach-intro h2{font-size:26px;letter-spacing:-.9px;margin:0 0 8px;font-weight:600}.coach-intro p{color:var(--cm);line-height:1.7;margin:0;max-width:640px}.coach-badge{border:1px solid #dedfd7;border-radius:30px;padding:9px 13px;white-space:nowrap;font-size:11px;letter-spacing:1px;text-transform:uppercase;display:flex;align-items:center;gap:7px}.coach-badge i{width:6px;height:6px;background:var(--cc);border-radius:100%}
  .coach-sessions{display:grid;grid-template-columns:1fr 1fr;gap:20px}.coach-panel{border:1px solid #e4e5dd;border-radius:18px;background:white;overflow:hidden}.coach-panelhead{display:flex;align-items:center;justify-content:space-between;padding:17px 19px;font-size:13px}.coach-panelhead strong{display:flex;align-items:center;gap:9px;font-weight:600}.coach-dot{background:var(--cc);height:7px;width:7px;border-radius:100%}.coach-pro .coach-dot{background:#8b9d64}.coach-source{font-size:10px;text-transform:uppercase;letter-spacing:.9px;color:var(--cm)}
  .coach-stage{height:270px;position:relative;background:#e9ece6;overflow:hidden;touch-action:manipulation}.coach-stage video,.coach-stage img{width:100%;height:100%;display:block;object-fit:contain;position:absolute;inset:0}.coach-stage img[hidden]{display:none}.coach-stage video[hidden]{display:none}.coach-stage.marking{cursor:crosshair}.coach-empty{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:25px;box-sizing:border-box;background:linear-gradient(130deg,#eaede7,#dfe4da)}.coach-empty svg{width:37px;height:37px;color:#8a9688;margin-bottom:15px}.coach-empty strong{font-size:16px;letter-spacing:-.3px;font-weight:500;margin-bottom:7px}.coach-empty span{font-size:12px;color:#7d887c;line-height:1.6;max-width:220px}.coach-overlay{position:absolute;inset:0;pointer-events:none;width:100%;height:100%;overflow:visible}.coach-guide{position:absolute;inset:18px;border:1px solid #fff9;pointer-events:none}.coach-guide:before{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #fff9}.coach-guide:after{content:'';position:absolute;top:50%;left:0;right:0;border-top:1px dashed #fff9}
  .coach-panelbody{padding:15px 18px 18px}.coach-panelbuttons{display:flex;gap:8px;flex-wrap:wrap}.coach-root button,.coach-file{font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #dddfd6;background:white;color:var(--ci);padding:9px 12px;border-radius:7px;font-size:11px;font-weight:500;line-height:1.2;transition:background .15s}.coach-root button:hover,.coach-file:hover{background:#f4f5ee}.coach-root button:focus-visible,.coach-file:focus-within{outline:2px solid var(--cc);outline-offset:3px}.coach-root button:disabled{opacity:.4;cursor:not-allowed}.coach-root button svg,.coach-file svg{width:14px;height:14px}.coach-root .coach-primary{background:var(--cc);border-color:var(--cc);color:white}.coach-root .coach-primary:hover{background:#dc5938}.coach-file input{position:absolute;clip-path:inset(100%);width:1px;height:1px;overflow:hidden}.coach-timeline{display:flex;align-items:center;gap:9px;margin-top:13px;min-height:20px}.coach-timeline input{width:100%;accent-color:var(--cc);height:3px}.coach-time{font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--cm)}.coach-marker-row{border-top:1px solid #edeee8;margin-top:13px;padding-top:12px;display:flex;align-items:center;gap:8px;justify-content:space-between}.coach-marker-row span{font-size:11px;color:var(--cm)}.coach-root .coach-marker-button{border:0;background:#f3f4ee;padding:6px 9px;font-size:10px}.coach-markhint{font-size:11px;color:var(--cm);line-height:1.6;margin:10px 0 0;min-height:18px}.coach-measure{font-size:12px;font-weight:600;color:var(--ci)}
  .coach-transport{display:flex;align-items:center;gap:13px;flex-wrap:wrap;margin:20px 0 26px;padding:14px 17px;border:1px solid #e2e4dc;border-radius:12px;background:#fafbf7}.coach-transport select{font:inherit;border:1px solid #dbddd4;border-radius:6px;padding:7px;color:var(--ci);background:white;font-size:11px}.coach-transport label{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--cm)}.coach-transport input[type=checkbox]{accent-color:var(--cc)}.coach-transport .coach-align{margin-left:auto;font-size:11px;color:var(--cm);max-width:280px;line-height:1.5}.coach-status{font-size:12px;line-height:1.6;color:var(--cm);min-height:19px;margin:0 0 19px}.coach-comparison{display:grid;grid-template-columns:1.25fr 1fr;gap:20px}.coach-insight{padding:23px;background:#f0f3e8;border:1px solid #e0e5d6;border-radius:15px}.coach-insight .coach-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#657454;display:block;margin-bottom:13px}.coach-insight h3{font-size:18px;letter-spacing:-.4px;margin:0 0 10px;font-weight:500}.coach-insight p{font-size:12px;line-height:1.8;margin:0;color:#65705e}.coach-angles{display:flex;gap:30px;margin-top:17px;padding-top:16px;border-top:1px solid #dce2d2}.coach-angles strong{display:block;font-size:26px;font-weight:500;letter-spacing:-1px}.coach-angles span{font-size:10px;color:#65705e}.coach-steps{padding:21px 24px;border:1px solid #e3e4dc;border-radius:15px;background:white}.coach-steps h3{font-size:14px;margin:0 0 17px;font-weight:500}.coach-step{display:flex;gap:13px;margin-top:13px}.coach-step b{font-size:10px;color:#8b9389;border:1px solid #e2e4da;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:400}.coach-step strong{font-size:11px;font-weight:500;display:block;margin-bottom:3px}.coach-step p{margin:0;font-size:10px;line-height:1.6;color:var(--cm)}.coach-privacy{font-size:10px;line-height:1.8;color:#899185;margin:18px 0 0;display:flex;align-items:flex-start;gap:7px}.coach-privacy svg{width:13px;height:13px;margin-top:2px;flex-shrink:0}
  @media(max-width:780px){.coach-intro{display:block}.coach-badge{width:max-content;margin-top:15px}.coach-sessions,.coach-comparison{grid-template-columns:1fr}.coach-stage{height:280px}.coach-transport .coach-align{margin-left:0;max-width:none;width:100%}.coach-intro h2{font-size:23px}}
  </style>
  <div class="coach-root">
    <div class="coach-intro"><div><h2>A closer look at your throw.</h2><p>Slow it down, find your rhythm, and compare the moments that matter with a professional reference.</p></div><span class="coach-badge"><i></i> Experimental pose coach</span></div>
    <div class="coach-sessions">
      ${panel('you','Your throw','Your training footage','Upload a side-on recording, or use your camera.','Your video')}
      ${panel('pro','Professional reference','Bring your reference','Add a professional clip you own or have permission to analyze.','Reference clip')}
    </div>
    <div class="coach-transport">
      <button type="button" class="coach-primary" data-play>${playIcon}<span>Play together</span></button>
      <label>Throwing arm <select data-arm aria-label="Throwing arm"><option value="right">Right</option><option value="left">Left</option></select></label>
      <label>Speed <select data-speed aria-label="Playback speed"><option value="0.25">0.25×</option><option value="0.5" selected>0.5×</option><option value="1">1×</option></select></label>
      <label><input type="checkbox" data-guides checked> Alignment guides</label>
      <span class="coach-align">Align both clips to the same throw phase, then play together.</span>
    </div>
    <p class="coach-status" role="status" aria-live="polite">Ready when you are. Start with a side-on view that includes your shoulder, elbow, and hand.</p>
    <div class="coach-comparison">
      <div class="coach-insight"><span class="coach-eyebrow">Frame comparison</span><h3 data-comparison-title>Give your technique a reference point.</h3><p data-comparison-copy>Pause each clip at the same point in the throw. Mark shoulder → elbow → wrist in each frame to compare the visible elbow angle.</p><div class="coach-angles"><div><strong data-angle-you>—</strong><span>Your elbow angle</span></div><div><strong data-angle-pro>—</strong><span>Reference angle</span></div><div><strong data-angle-diff>—</strong><span>Difference</span></div></div></div>
      <div class="coach-steps"><h3>What to look for</h3><div class="coach-step"><b>01</b><div><strong>A steady foundation</strong><p>Watch for head or torso movement as you release.</p></div></div><div class="coach-step"><b>02</b><div><strong>A repeatable throwing path</strong><p>Compare elbow position across several of your throws.</p></div></div><div class="coach-step"><b>03</b><div><strong>A relaxed follow-through</strong><p>Check that your hand continues toward the target.</p></div></div></div>
    </div>
    <p class="coach-privacy"><span>Need a professional reference? <a href="https://www.pdc.tv/videos" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Browse official PDC videos ↗</a>. Add a local clip you own or have permission to analyze; videos are not downloaded automatically.</span></p>
    <p class="coach-privacy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/></svg><span>Your camera and videos stay in this browser. Video and pose analysis run on your device. Experimental pose estimates use Google MediaPipe’s general-purpose 2D model; they are not a darts-trained assessment. Mark points manually if detection is uncertain. Compare matched views and throw phases. Camera access requires your permission.</span></p>
  </div>`;

  function panel(key,title,emptyTitle,emptyText,fileLabel) {
    return `<section class="coach-panel coach-${key}" data-panel="${key}"><div class="coach-panelhead"><strong><i class="coach-dot"></i>${title}</strong><span class="coach-source" data-source="${key}">No clip loaded</span></div><div class="coach-stage" data-stage="${key}" aria-label="${title} frame. Mark shoulder, elbow, and wrist after pausing."><div class="coach-empty" data-empty="${key}">${cameraIcon}<strong>${emptyTitle}</strong><span>${emptyText}</span></div><video data-video="${key}" playsinline muted hidden></video><img data-still="${key}" alt="Frozen camera frame" hidden><div class="coach-guide" data-guide="${key}" hidden></div><svg class="coach-overlay" data-overlay="${key}" aria-hidden="true"></svg></div><div class="coach-panelbody"><div class="coach-panelbuttons"><label class="coach-file">${uploadIcon}${fileLabel}<input type="file" accept="video/*" data-upload="${key}" aria-label="Upload ${fileLabel.toLowerCase()}"></label>${key==='you'?`<button type="button" data-camera>${cameraIcon}Start camera</button><button type="button" data-freeze hidden>Freeze frame</button>`:''}<button type="button" data-detect="${key}" disabled>Detect pose</button><button type="button" data-localplay="${key}" disabled>${playIcon}Play</button></div><div class="coach-timeline"><input type="range" data-scrub="${key}" min="0" max="0" step="0.01" value="0" disabled aria-label="${title} timeline"><span class="coach-time" data-time="${key}">0:00 / 0:00</span></div><div class="coach-marker-row"><span data-marker-text="${key}">Mark 3 points to measure</span><button type="button" class="coach-marker-button" data-clear="${key}">Clear points</button></div><p class="coach-markhint" data-hint="${key}">Load a clip to begin.</p></div></section>`;
  }
  const $ = selector => container.querySelector(selector);
  const on = (el,type,fn,options) => {el.addEventListener(type,fn,options);cleanupListeners.push(()=>el.removeEventListener(type,fn,options));};
  const status = message => {if(!stopped) $('.coach-status').textContent=message;};
  function stopCamera() {
    // getUserMedia cannot be cancelled; invalidate its request so late streams are stopped.
    cameraGeneration++;cameraPending=false;state.you.revision++;
    if(stream) {stream.getTracks().forEach(track=>track.stop());stream=null;}
    if(!stopped){
      const button=$('[data-camera]');button.disabled=false;button.innerHTML=`${cameraIcon}Start camera`;
      $('[data-freeze]').hidden=true;
    }
  }
  function show(key,mode) {
    const s=state[key];s.mode=mode;
    $(`[data-empty="${key}"]`).hidden=mode!=='empty';
    $(`[data-video="${key}"]`).hidden=!['video','camera'].includes(mode);
    $(`[data-still="${key}"]`).hidden=mode!=='still';
    $(`[data-guide="${key}"]`).hidden=mode==='empty'||!$('[data-guides]').checked;
    $(`[data-stage="${key}"]`).classList.toggle('marking',s.ready&&mode!=='camera');
    $(`[data-localplay="${key}"]`).disabled=mode!=='video'||!s.ready;
    $(`[data-detect="${key}"]`).disabled=!s.ready||detecting;
    $(`[data-scrub="${key}"]`).disabled=mode!=='video'||!s.ready;
    updateHint(key);
  }
  function updateHint(key) {
    const s=state[key];
    $(`[data-hint="${key}"]`).textContent=s.mode==='empty'?'Load a clip to begin.':s.mode==='camera'?'Frame your throwing arm, then freeze a frame to mark points.':s.marks.length===3?'Angle marked. Clear points or move to a new frame to measure again.':`Pause at a matching throw phase. Tap your ${names[s.marks.length]}.`;
    $(`[data-marker-text="${key}"]`).textContent=s.marks.length===3?`${angleOf(s.marks)??'—'}° visible elbow angle`:`${s.marks.length}/3 points marked`;
  }
  function renderMarks(key) {
    const s=state[key],stage=$(`[data-stage="${key}"]`),box=stage.getBoundingClientRect(), svg=$(`[data-overlay="${key}"]`);
    const fit=getFit(key,box);
    const points=s.marks.map(p=>({x:fit.x+p.x*fit.width,y:fit.y+p.y*fit.height}));
    const color=key==='you'?'#f77451':'#c6da97';
    svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    svg.innerHTML=`${points.length>1?`<polyline points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`:''}${points.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="6" fill="${color}" stroke="white" stroke-width="2"/><text x="${p.x+10}" y="${p.y-9}" fill="white" stroke="#263126" stroke-width="2.8" paint-order="stroke" font-size="12" font-family="sans-serif" font-weight="600">${names[i][0].toUpperCase()}</text>`).join('')}`;
    updateHint(key);updateComparison();
  }
  function getFit(key,box) {
    const s=state[key], ratio=s.naturalW/s.naturalH||box.width/box.height;
    let width=box.width,height=width/ratio;
    if(height>box.height){height=box.height;width=height*ratio;}
    return {x:(box.width-width)/2,y:(box.height-height)/2,width,height};
  }
  function clearMarks(key){state[key].revision++;state[key].marks=[];renderMarks(key);}
  function updateComparison() {
    const you=angleOf(state.you.marks),pro=angleOf(state.pro.marks);
    $('[data-angle-you]').textContent=you===null?'—':`${you}°`;
    $('[data-angle-pro]').textContent=pro===null?'—':`${pro}°`;
    $('[data-angle-diff]').textContent=you===null||pro===null?'—':`${Math.abs(you-pro)}°`;
    if(you===null||pro===null) {
      $('[data-comparison-title]').textContent='Give your technique a reference point.';
      $('[data-comparison-copy]').textContent='Pause each clip at the same point in the throw. Mark shoulder → elbow → wrist in each frame to compare the visible elbow angle.';
    } else {
      const diff=Math.abs(you-pro);
      $('[data-comparison-title]').textContent=`Your marked elbow angles differ by ${diff}°.`;
      $('[data-comparison-copy]').textContent=diff<=10?'These two frames have a similar visible elbow angle. Check several throws for consistency, keeping camera position and throw phase matched. A similar angle alone does not establish correct form.':'Check that camera angle and throw phase match before interpreting this difference. Review your elbow path across several throws; one professional’s angle is a reference, not a universal target.';
    }
  }
  function updateTransport(){
    if(stopped)return;
    playing=Object.keys(state).some(key=>state[key].mode==='video'&&!$(`[data-video="${key}"]`).paused);
    $('[data-play]').innerHTML=`${playing?pauseIcon:playIcon}<span>${playing?'Pause both':'Play together'}</span>`;
    for(const key of Object.keys(state)){
      const v=$(`[data-video="${key}"]`);
      $(`[data-localplay="${key}"]`).innerHTML=`${!v.paused?pauseIcon:playIcon}${!v.paused?'Pause':'Play'}`;
    }
  }
  async function playVideo(key) {
    const s=state[key],v=$(`[data-video="${key}"]`);
    if(s.mode!=='video'||!s.ready)return false;
    clearMarks(key);v.playbackRate=Number($('[data-speed]').value);
    if(v.ended)v.currentTime=0;
    try{await v.play();return true;}catch{status('This clip could not play. Try an MP4 or WebM supported by your browser.');return false;}
  }
  for(const key of Object.keys(state)) {
    const s=state[key],v=$(`[data-video="${key}"]`),upload=$(`[data-upload="${key}"]`),scrub=$(`[data-scrub="${key}"]`);
    on(upload,'change',()=>{
      const file=upload.files?.[0];if(!file)return;
      if(!file.type.startsWith('video/')){status('Choose a video file such as MP4, MOV, or WebM.');return;}
      if(key==='you')stopCamera();
      v.pause();v.srcObject=null;
      if(s.url){URL.revokeObjectURL(s.url);urls.delete(s.url);}
      s.url=URL.createObjectURL(file);urls.add(s.url);s.ready=false;clearMarks(key);
      v.src=s.url;v.load();show(key,'video');
      $(`[data-source="${key}"]`).textContent=file.name.length>25?file.name.slice(0,22)+'…':file.name;
      status(`Loading ${key==='you'?'your':'reference'} clip locally…`);
    });
    on(v,'loadedmetadata',()=>{
      s.revision++;s.naturalW=v.videoWidth;s.naturalH=v.videoHeight;s.ready=true;
      if(Number.isFinite(v.duration))scrub.max=v.duration;
      v.playbackRate=Number($('[data-speed]').value);show(key,s.mode);renderMarks(key);
      if(s.mode==='video')status(`${key==='you'?'Your clip':'Reference clip'} is ready. Scrub to a frame, then mark shoulder, elbow, and wrist.`);
    });
    on(v,'error',()=>{if(s.mode==='video'){s.revision++;s.ready=false;show(key,s.mode);status('This browser cannot read that clip. Try a locally saved MP4 (H.264) or WebM video.');}});
    on(v,'play',()=>{clearMarks(key);updateTransport();});on(v,'pause',updateTransport);on(v,'ended',updateTransport);
    on(v,'seeking',()=>clearMarks(key));on(v,'seeked',()=>clearMarks(key));
    on(scrub,'input',()=>{v.pause();v.currentTime=Number(scrub.value);clearMarks(key);updateTransport();});
    on($(`[data-localplay="${key}"]`),'click',async()=>{if(v.paused)await playVideo(key);else v.pause();updateTransport();});
    on($(`[data-clear="${key}"]`),'click',()=>clearMarks(key));
    on($(`[data-stage="${key}"]`),'click',event=>{
      if(!s.ready||v.seeking)return;
      if(s.mode==='camera'){status('Freeze a camera frame before marking points.');return;}
      if(s.mode==='video'&&!v.paused){v.pause();status('Clip paused. Mark shoulder, elbow, and wrist in order.');}
      if(s.marks.length===3){status('Clear the existing points before marking this frame again.');return;}
      const box=event.currentTarget.getBoundingClientRect(),fit=getFit(key,box);
      const x=(event.clientX-box.left-fit.x)/fit.width,y=(event.clientY-box.top-fit.y)/fit.height;
      if(x<0||x>1||y<0||y>1)return;
      s.revision++;s.marks.push({x,y,px:x*s.naturalW,py:y*s.naturalH});
      renderMarks(key);
    });
  }
  async function getDetector() {
    if (detector) return detector;
    if (!detectorPromise) detectorPromise = (async () => {
      const {FilesetResolver, PoseLandmarker} = await import('./assets/vision_bundle.mjs');
      if(stopped)throw new Error('Review closed.');
      const files = await FilesetResolver.forVisionTasks(new URL('./assets/wasm', import.meta.url).href);
      if(stopped)throw new Error('Review closed.');
      const instance = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath:new URL('./assets/pose_landmarker_lite.task', import.meta.url).href,delegate:'CPU'},
        runningMode:'IMAGE',numPoses:1
      });
      if(stopped){instance.close();throw new Error('Review closed.');}
      detector = instance;return instance;
    })().catch(error=>{detectorPromise=null;throw error;});
    return detectorPromise;
  }
  function frameCanvas(key) {
    const s=state[key],canvas=document.createElement('canvas');
    canvas.width=s.naturalW;canvas.height=s.naturalH;
    canvas.getContext('2d').drawImage(s.mode==='still'?$(`[data-still="${key}"]`):$(`[data-video="${key}"]`),0,0);
    return canvas;
  }
  async function detectPose(key) {
    const s=state[key],v=$(`[data-video="${key}"]`);
    if(stopped||detecting||!s.ready)return;
    if(v.seeking){status('Wait for the selected frame to load before detecting pose.');return;}
    detecting=true;
    for(const k of Object.keys(state))$(`[data-detect="${k}"]`).disabled=true;
    const button=$(`[data-detect="${key}"]`);button.textContent='Analyzing…';
    let snapshot=null;
    const isCurrent=()=>!stopped&&snapshot&&s.ready&&s.revision===snapshot.revision&&$('[data-arm]').value===snapshot.arm;
    try {
      v.pause();
      const canvas=frameCanvas(key);
      if(s.mode==='camera'){
        $(`[data-still="${key}"]`).src=canvas.toDataURL('image/jpeg',.92);v.srcObject=null;stopCamera();show(key,'still');$(`[data-source="${key}"]`).textContent='Captured frame';
      }
      clearMarks(key);
      snapshot={revision:s.revision,width:canvas.width,height:canvas.height,arm:$('[data-arm]').value};
      status(detector?'Estimating pose locally…':'Loading the pose model for on-device analysis. The first run can take a moment…');
      const model=await getDetector();
      // An upload, seek, playback, arm change, manual edit, or unmount invalidates this frame.
      if(!isCurrent())return;
      const result=model.detect(canvas),landmarks=result.landmarks?.[0];
      const indices=snapshot.arm==='right'?[12,14,16]:[11,13,15];
      const selected=indices.map(index=>landmarks?.[index]);
      if(selected.some(point=>!point||(point.visibility??0)<.6||point.x<0||point.x>1||point.y<0||point.y>1)){
        clearMarks(key);status('The throwing arm was not visible with enough confidence. Use a clearer side-on frame, check your selected arm, or mark the three points manually.');return;
      }
      s.marks=selected.map(point=>({x:point.x,y:point.y,px:point.x*snapshot.width,py:point.y*snapshot.height}));
      renderMarks(key);
      status('Pose estimated on your device. Check the shoulder, elbow, and wrist points before comparing. These are 2D estimates, not a validated darts assessment.');
    } catch(error) {
      if(!stopped&&(!snapshot||isCurrent()))status('The pose model could not analyze this frame. You can still mark shoulder, elbow, and wrist manually.');
    } finally {
      detecting=false;if(!stopped){button.textContent='Detect pose';for(const k of Object.keys(state))show(k,state[k].mode);}
    }
  }
  for(const key of Object.keys(state))on($(`[data-detect="${key}"]`),'click',()=>detectPose(key));
  on($('[data-arm]'),'change',()=>{for(const key of Object.keys(state))clearMarks(key);status('Throwing arm changed. Detect pose again or mark the selected arm.');});
  on($('[data-camera]'),'click',async()=>{
    const v=$('[data-video="you"]'),s=state.you;
    if(stopped||cameraPending)return;
    if(stream){stopCamera();v.pause();v.srcObject=null;s.ready=false;clearMarks('you');show('you','empty');$('[data-source="you"]').textContent='Camera stopped';status('Camera stopped.');return;}
    if(!navigator.mediaDevices?.getUserMedia){status('Camera is unavailable in this browser. Upload a video to review your throw.');return;}
    const request=++cameraGeneration;
    cameraPending=true;
    const button=$('[data-camera]');button.disabled=true;button.innerHTML=`${cameraIcon}Requesting camera…`;
    let acquiredStream=null;
    try{
      v.pause();v.srcObject=null;s.ready=false;clearMarks('you');show('you','empty');
      status('Waiting for camera permission. You can also upload a recording.');
      acquiredStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
      if(stopped||request!==cameraGeneration){acquiredStream.getTracks().forEach(t=>t.stop());return;}
      stream=acquiredStream;
      v.removeAttribute('src');v.srcObject=stream;show('you','camera');await v.play();
      if(stopped||request!==cameraGeneration){acquiredStream.getTracks().forEach(t=>t.stop());return;}
      cameraPending=false;button.disabled=false;button.innerHTML=`${cameraIcon}Stop camera`;$('[data-freeze]').hidden=false;$('[data-source="you"]').textContent='Live camera';
      status('Camera is live. Stand side-on with your throwing arm visible, then freeze a frame.');
    }catch(error){
      if(acquiredStream)acquiredStream.getTracks().forEach(t=>t.stop());
      if(stopped||request!==cameraGeneration)return;
      stopCamera();v.srcObject=null;s.ready=false;clearMarks('you');show('you','empty');status(error.name==='NotAllowedError'?'Camera access was not granted. You can still upload a recording.':error.name==='NotFoundError'?'No camera was found. Upload a recording to continue.':'Camera could not start. Upload a recording or check browser camera settings.');
    }
  });
  on($('[data-freeze]'),'click',()=>{
    const s=state.you,v=$('[data-video="you"]');if(!s.ready||!v.videoWidth)return;
    const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d').drawImage(v,0,0);
    $('[data-still="you"]').src=canvas.toDataURL('image/jpeg',.92);v.pause();v.srcObject=null;stopCamera();clearMarks('you');show('you','still');$('[data-source="you"]').textContent='Captured frame';status('Frame captured and camera stopped. Mark shoulder, elbow, and wrist.');
  });
  on($('[data-play]'),'click',async()=>{
    const available=Object.keys(state).filter(key=>state[key].mode==='video'&&state[key].ready);
    if(!available.length){status('Upload a clip first. Camera snapshots can be marked but do not play.');return;}
    if(playing)available.forEach(key=>$(`[data-video="${key}"]`).pause());
    else await Promise.all(available.map(playVideo));updateTransport();
  });
  on($('[data-speed]'),'change',()=>{for(const key of Object.keys(state))$(`[data-video="${key}"]`).playbackRate=Number($('[data-speed]').value);});
  on($('[data-guides]'),'change',()=>{for(const key of Object.keys(state))show(key,state[key].mode);});
  on(window,'resize',()=>{for(const key of Object.keys(state))renderMarks(key);});
  function tick(){
    if(stopped)return;
    for(const key of Object.keys(state)){
      const v=$(`[data-video="${key}"]`),s=state[key];if(s.mode!=='video')continue;
      $(`[data-scrub="${key}"]`).value=v.currentTime;
      $(`[data-time="${key}"]`).textContent=`${formatTime(v.currentTime)} / ${formatTime(v.duration)}`;
    }
    raf=requestAnimationFrame(tick);
  }
  tick();
  return ()=>{
    stopped=true;stopCamera();for(const key of Object.keys(state))state[key].revision++;cancelAnimationFrame(raf);cleanupListeners.forEach(fn=>fn());
    for(const key of Object.keys(state)){$(`[data-video="${key}"]`).pause();$(`[data-video="${key}"]`).srcObject=null;$(`[data-video="${key}"]`).removeAttribute('src');}
    urls.forEach(url=>URL.revokeObjectURL(url));if(detector){detector.close();detector=null;}
  };
}
