(function () {
  var state = { user: null, date: null, puzzle: null, selected: null, shareId: null, authMode: "login" };
  var el = function (id) { return document.getElementById(id); };

  async function api(url, options) {
    var response = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    var data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function formatDate(date) { return new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" }); }
  function moveDate(amount) { var date = new Date(state.date + "T12:00:00"); date.setDate(date.getDate() + amount); return date.toISOString().slice(0,10); }
  function updateUser(user) {
    state.user = user;
    el("account-button").textContent = user ? user.username : "Sign in";
    el("mini-stats").hidden = !user;
    if (user) el("mini-stats").textContent = "🔥 " + user.streak + " day streak · " + user.completed + " solved";
    el("guest-panel").hidden = !!user;
    el("game-shell").hidden = !user;
  }

  function findNode(node, id) { if (node.id === id) return node; for (var i=0;i<node.children.length;i++) { var found=findNode(node.children[i],id); if(found)return found; } return null; }
  function renderNode(node) {
    var wrap = document.createElement("span"); wrap.className="clue-wrap"; wrap.append(document.createTextNode(node.before || ""));
    var button=document.createElement("button"); button.className="clue-button"+(node.solved?" solved":"")+(state.selected===node.id?" active":""); button.dataset.id=node.id; button.textContent=node.display || node.clue; button.addEventListener("click",function(){selectClue(node.id);}); wrap.append(button);
    if(node.children.length){var children=document.createElement("span");children.className="child-clues";children.append(document.createTextNode(" ("));node.children.forEach(function(child,index){if(index)children.append(document.createTextNode(" · "));children.append(renderNode(child));});children.append(document.createTextNode(")"));wrap.append(children);}
    wrap.append(document.createTextNode(node.after || "")); return wrap;
  }
  function selectClue(id) { state.selected=id; var node=findNode(state.puzzle.root,id); el("answer-panel").hidden=node.solved||!!state.shareId; el("active-clue").textContent=node.clue; el("reveal-button").hidden=!!node.display; el("peek-button").hidden=!!node.display; el("game-message").textContent=""; render(); if(!node.solved)setTimeout(function(){el("answer-input").focus();},0); }
  function render(data) {
    if(data){state.puzzle=data.puzzle;state.shareId=data.shareId;el("score").textContent=data.score;el("rank").textContent=data.rank;if(data.user)updateUser(data.user);}
    el("puzzle-date").textContent=formatDate(state.puzzle.date);el("puzzle-title").textContent=state.puzzle.title;el("next-day").disabled=state.date>=new Date().toISOString().slice(0,10);
    var puzzle=el("puzzle");puzzle.innerHTML="";puzzle.append(renderNode(state.puzzle.root));
    el("complete-panel").hidden=!state.shareId;el("answer-panel").hidden=!!state.shareId||!state.selected;
    if(state.shareId){el("final-score").textContent=data?data.score:el("score").textContent;el("final-rank").textContent=data?data.rank:el("rank").textContent;el("fact").textContent=state.puzzle.fact;}
  }
  async function loadPuzzle(date){state.date=date;state.selected=null;try{render(await api("/api/puzzle/"+date));}catch(error){el("game-message").textContent=error.message;}}
  async function action(type,guess){try{var data=await api("/api/puzzle/"+state.date+"/action",{method:"POST",body:JSON.stringify({action:type,clueId:state.selected,guess:guess})});if(type==="guess"&&!findNode(data.puzzle.root,state.selected).solved)el("game-message").textContent="Not quite. Two points deducted.";else el("game-message").textContent="";render(data);}catch(error){el("game-message").textContent=error.message;}}
  function openAuth(mode){state.authMode=mode||"login";el("auth-dialog").showModal();setAuthMode(state.authMode);}
  function setAuthMode(mode){state.authMode=mode;var login=mode==="login";el("login-tab").classList.toggle("active",login);el("register-tab").classList.toggle("active",!login);el("auth-title").textContent=login?"Welcome back":"Claim your record";el("auth-submit").textContent=login?"Sign in":"Create account";el("password").autocomplete=login?"current-password":"new-password";el("auth-error").textContent="";}
  async function boot(){var data=await api("/api/me");state.date=data.today;updateUser(data.user);if(data.user)await loadPuzzle(data.today);}

  el("account-button").addEventListener("click",async function(){if(state.user){await api("/api/logout",{method:"POST"});location.reload();}else openAuth("login");});
  el("guest-signin").addEventListener("click",function(){openAuth("register");});el("close-dialog").addEventListener("click",function(){el("auth-dialog").close();});el("login-tab").addEventListener("click",function(){setAuthMode("login");});el("register-tab").addEventListener("click",function(){setAuthMode("register");});
  el("auth-form").addEventListener("submit",async function(event){event.preventDefault();try{var data=await api("/api/"+state.authMode,{method:"POST",body:JSON.stringify({username:el("username").value,password:el("password").value})});updateUser(data.user);el("auth-dialog").close();await loadPuzzle(state.date);}catch(error){el("auth-error").textContent=error.message;}});
  el("answer-form").addEventListener("submit",function(event){event.preventDefault();var value=el("answer-input").value;el("answer-input").value="";action("guess",value);});el("peek-button").addEventListener("click",function(){action("peek");});el("reveal-button").addEventListener("click",function(){if(confirm("Reveal this answer? A peek and reveal cost 20 points total."))action("reveal");});
  el("previous-day").addEventListener("click",function(){loadPuzzle(moveDate(-1));});el("next-day").addEventListener("click",function(){if(!el("next-day").disabled)loadPuzzle(moveDate(1));});
  el("share-button").addEventListener("click",async function(){var url=location.origin+"/share/"+state.shareId;var text=state.user.username+" scored "+el("score").textContent+"/100 · "+el("rank").textContent;if(navigator.share){try{await navigator.share({title:"Bracket Verified",text:text,url:url});return;}catch(_){} }await navigator.clipboard.writeText(url);el("share-help").textContent="Verified link copied. Paste it into iMessage.";});
  boot().catch(function(){updateUser(null);});
})();
