const KEY='idlenomics_settings_v1';
const defaults={motion:'system',parallax:true,quality:'high',fps:60,text:'normal',contrast:false};
export function initSettings(api){
  let prefs={...defaults};
  try{
    const saved=JSON.parse(localStorage.getItem(KEY));
    for(const [key,allowed]of Object.entries({motion:['system','full','reduced','static'],quality:['high','balanced','low'],fps:[30,60],text:['normal','large','larger'],parallax:[true,false],contrast:[true,false]}))if(allowed.includes(saved?.[key]))prefs[key]=saved[key];
  }catch{}
  const dialog=document.createElement('dialog');dialog.id='settings-dialog';dialog.setAttribute('aria-labelledby','settings-title');
  dialog.innerHTML=`<header class="settings-heading"><div><p class="helper-note">YOUR CIVILIZATION, YOUR PREFERENCES</p><h2 id="settings-title">Settings</h2></div><button type="button" id="settings-close" class="btn-small" aria-label="Close settings">Close ×</button></header>
  <p class="helper-note">Changes apply immediately. Your civilization keeps progressing while this menu is open.</p>
  <form id="settings-form">
  <fieldset><legend>Appearance & readability</legend>
    <label>Theme<select name="theme"><option value="dark">Dusk</option><option value="paper">Paper / daylight</option></select></label>
    <label>Text size<select name="text"><option value="normal">Standard</option><option value="large">Large</option><option value="larger">Extra large</option></select></label>
    <label class="settings-check"><input type="checkbox" name="contrast"> Solid panels for stronger contrast</label>
  </fieldset>
  <fieldset><legend>Motion & performance</legend>
    <label>Background motion<select name="motion"><option value="system">Follow device preference</option><option value="full">Full animation</option><option value="reduced">Reduced motion</option><option value="static">Static background</option></select></label>
    <p class="helper-note">Reduced motion freezes ambient movement and disables parallax. Static also stops animation while the civilization continues to grow.</p>
    <label class="settings-check"><input type="checkbox" name="parallax"> Pointer / tilt parallax</label>
    <label>Render quality<select name="quality"><option value="high">High — native resolution</option><option value="balanced">Balanced — up to 1.5× resolution</option><option value="low">Low — 1× resolution</option></select></label>
    <label>Animation limit<select name="fps"><option value="60">60 frames per second</option><option value="30">30 frames per second</option></select></label>
    <p class="helper-note">Lower resolution and frame rate reduce background rendering work. Production speed is unchanged.</p>
  </fieldset></form>
  <section id="settings-save" tabindex="-1"><h3>Save & recovery</h3><p id="settings-save-status" aria-live="off">Automatic saving runs every second on this device.</p>
  <div class="btn-row"><button type="button" data-action="save" class="btn-brutal">Save now</button><button type="button" data-action="export" class="btn-brutal">Export save file</button><button type="button" data-action="copy" class="btn-brutal">Copy save string</button></div>
  <label for="settings-save-string">Save string</label><textarea id="settings-save-string" class="brutal-input save-textarea" rows="3" spellcheck="false" placeholder="Paste a save string to import"></textarea>
  <div class="btn-row"><button type="button" data-action="import" class="btn-brutal">Import save</button><button type="button" data-action="recover" class="btn-brutal">Restore recovery backup</button></div>
  <p class="helper-note">Import and reset create one recovery backup of your previous civilization on this device. Restoring swaps that backup with your current civilization. Export a file for a durable backup. Cloud snapshots remain in the Vault.</p></section>
  <section id="settings-reset" tabindex="-1"><h3>Reset civilization</h3><p>Removes your current resources, buildings, research, population, and history. Settings and cloud credentials are retained.</p><label for="settings-reset-word">Type RESET to confirm</label><input id="settings-reset-word" class="brutal-input" autocomplete="off"><button type="button" data-action="reset" class="btn-brutal accent-terra" disabled>Reset civilization</button></section>
  <p id="settings-message" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),message=dialog.querySelector('#settings-message'),box=dialog.querySelector('textarea');
  const deviceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  function apply(){
    document.body.classList.toggle('reduce-ui-motion',prefs.motion==='reduced'||prefs.motion==='static'||(prefs.motion==='system'&&deviceMotion.matches));
    document.body.dataset.textSize=prefs.text;document.body.classList.toggle('solid-panels',prefs.contrast);
    api.renderer.setPreferences(prefs);
  }
  function sync(){for(const [key,value]of Object.entries(prefs)){const el=form.elements.namedItem(key);if(el.type==='checkbox')el.checked=value;else el.value=String(value);}form.elements.theme.value=api.getTheme()?'paper':'dark';}
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('change',e=>{
    const el=e.target;if(el.name==='theme'){api.setTheme(el.value==='paper');return;}
    prefs[el.name]=el.type==='checkbox'?el.checked:el.name==='fps'?Number(el.value):el.value;apply();
    try{localStorage.setItem(KEY,JSON.stringify(prefs));message.textContent='Preferences saved.';}catch{message.textContent='Preferences applied for this session. Device storage is unavailable.';}
  });
  const resetWord=dialog.querySelector('#settings-reset-word'),resetButton=dialog.querySelector('[data-action="reset"]');
  resetWord.addEventListener('input',()=>resetButton.disabled=resetWord.value!=='RESET');
  dialog.addEventListener('click',async e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    try{
      if(action==='save'){if(!api.save())throw Error('Unable to save on this device. Export a backup.');message.textContent='Civilization saved on this device.';}
      if(action==='export'){
        const blob=new Blob([api.exportSave()],{type:'text/plain'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='idlenomics-save-'+new Date().toISOString().slice(0,10)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent='Save file exported.';
      }
      if(action==='copy'){
        box.value=api.exportSave();
        try{await navigator.clipboard.writeText(box.value);message.textContent='Save string copied.';}catch{box.focus();box.select();message.textContent='Copy the selected save string manually.';}
      }
      if(action==='import'){
        if(!box.value.trim())throw Error('Paste a save string first.');
        if(!confirm('Replace this civilization with the imported save? Your current civilization will become the recovery backup.'))return;
        api.importSave(box.value);sync();message.textContent='Save imported. Previous civilization backed up.';
      }
      if(action==='recover'){
        if(!confirm('Restore the recovery backup? Your current civilization will become the new backup.'))return;
        api.recover();sync();message.textContent='Recovery backup restored.';
      }
      if(action==='reset'&&resetWord.value==='RESET'){api.reset();resetWord.value='';resetButton.disabled=true;message.textContent='Civilization reset. Previous civilization backed up.';}
    }catch(error){message.textContent=error.message||'The action could not be completed. Your civilization has not been replaced.';}
  });
  let opener;
  function open(section){opener=document.activeElement;sync();message.textContent='';resetWord.value='';resetButton.disabled=true;if(!dialog.open)dialog.showModal();if(section)dialog.querySelector('#settings-'+section)?.focus();}
  dialog.querySelector('#settings-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{opener?.focus();});
  document.getElementById('btn-settings').onclick=()=>open();
  document.addEventListener('local-save-status',e=>{dialog.querySelector('#settings-save-status').textContent=e.detail;});
  deviceMotion.addEventListener('change',apply);
  apply();return{open};
}
