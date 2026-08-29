/* ============================================================
   js/handicap.js — the Course Handicap calculator rendered inside a
   course popup.

   Loaded as a plain <script> (not a module) in the fixed order
   listed in london-golf-map-v5_1.html — top-level declarations
   here are global, which is what the inline onclick= handlers in
   the HTML resolve against.
   ============================================================ */

/* GOLF-13: Course Handicap calculator. The formula itself needs no data
   source. courseStats (par/slope/course rating) pre-fills the inputs when
   we have it via GOLF-12 — currently unpopulated for every course pending
   a free data source — but the calculator is not gated on that: any field
   we don't have, the visitor can type in themselves (e.g. off their own
   scorecard), so the tool works on every course today rather than staying
   invisible until GOLF-12 lands. */
function courseHandicap(hcIndex,slope,rating,par){
  return Math.round(hcIndex*(slope/113)+(rating-par));
}
function calcHTML(i){
  const cs=V(i,'courseStats')||{};
  const tees=(cs.tees&&cs.tees.length)?cs.tees:(cs.par!=null?[{name:'',par:cs.par,slope:cs.slope,rating:cs.rating}]:[]);
  HC_TEES[i]=tees;
  const first=tees[0]||{};
  const fld=(id,label,val,step)=>`<div><label for="${id}" style="display:block;font:500 9px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--stone);margin-bottom:3px">${label}</label><input id="${id}" type="number" step="${step||1}" value="${val!==undefined?val:''}" style="width:100%;padding:6px 7px;border:1px solid var(--line);border-radius:5px;font:400 12px var(--font-sans)"></div>`;
  const teeSelect=tees.length>1?`<div style="margin-bottom:7px"><label for="hc-tee-${i}" style="display:block;font:500 9px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--stone);margin-bottom:3px">Tee</label><select id="hc-tee-${i}" onchange="applyTee(${i})" style="width:100%;padding:6px 7px;border:1px solid var(--line);border-radius:5px;font:400 12px var(--font-sans)">${tees.map((t,idx)=>`<option value="${idx}">${esc(t.name||'Tee '+(idx+1))}</option>`).join('')}</select></div>`:'';
  return `<div class="note" style="border-top:1px solid var(--line);padding-top:8px;margin-top:9px">
    <button class="btn ghost" id="hc-toggle-${i}" onclick="toggleCalc(${i})">Calculate your handicap</button>
    <div id="hc-body-${i}" style="display:none;margin-top:8px">
      <b style="display:block;font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--stone);margin-bottom:5px">Course Handicap calculator</b>
      <p style="margin:0 0 7px;font-size:11px;color:var(--stone)">${tees.length?`We have this course's par/slope/rating pre-filled below.`:`We don't have this course's par/slope/rating yet — enter them from your scorecard, or add it via "Correct this".`}</p>
      ${teeSelect}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:7px">
        ${fld(`hc-par-${i}`,'Par',first.par)}
        ${fld(`hc-slope-${i}`,'Slope',first.slope)}
        ${fld(`hc-rating-${i}`,'Rating',first.rating,0.1)}
        ${fld(`hc-idx-${i}`,'Your Index',undefined,0.1)}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn ghost" onclick="runCalc(${i})">Calculate</button>
        <span id="hc-out-${i}" style="font-variant-numeric:tabular-nums;font-size:13px;font-weight:600"></span>
      </div>
    </div>
  </div>`;
}
function applyTee(i){
  const t=HC_TEES[i][document.getElementById(`hc-tee-${i}`).value];
  document.getElementById(`hc-par-${i}`).value=t.par!=null?t.par:'';
  document.getElementById(`hc-slope-${i}`).value=t.slope!=null?t.slope:'';
  document.getElementById(`hc-rating-${i}`).value=t.rating!=null?t.rating:'';
}
function toggleCalc(i){
  const body=document.getElementById(`hc-body-${i}`),btn=document.getElementById(`hc-toggle-${i}`);
  const open=body.style.display!=='none';
  body.style.display=open?'none':'block';
  btn.textContent=open?'Calculate your handicap':'Hide handicap calculator';
}
function runCalc(i){
  const par=parseFloat(document.getElementById(`hc-par-${i}`).value);
  const slope=parseFloat(document.getElementById(`hc-slope-${i}`).value);
  const rating=parseFloat(document.getElementById(`hc-rating-${i}`).value);
  const idx=parseFloat(document.getElementById(`hc-idx-${i}`).value);
  const out=document.getElementById(`hc-out-${i}`);
  if([par,slope,rating,idx].some(isNaN)){out.textContent='Fill in all four fields.';return}
  out.textContent=`Course Handicap: ${courseHandicap(idx,slope,rating,par)}`;
}
