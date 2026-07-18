(function () {
  var state = { user: null, date: null, leaderboardDate: null, today: null, startDate: null, puzzle: null, selected: null, shareId: null, authMode: "login", perfectInputDisqualified: false, perfectInputSync: null };
  var el = function (id) { return document.getElementById(id); };

  async function api(url, options) {
    var response = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    var data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function formatDate(date) { return new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" }); }
  function moveDate(date, amount) { var value = new Date(date + "T12:00:00"); value.setDate(value.getDate() + amount); return value.toISOString().slice(0,10); }
  function updateUser(user) {
    state.user = user;
    document.body.classList.toggle("signed-in", !!user);
    el("account-button").textContent = user ? user.username : "Sign in";
    el("play-button").hidden = !user;
    el("leaderboard-button").hidden = !user;
    el("guest-panel").hidden = !!user;
    el("game-shell").hidden = !user;
    if (user) {
      el("profile-username").textContent = user.username;
      el("profile-completed").textContent = user.completed;
      el("profile-average").textContent = user.averageScore === null ? "—" : user.averageScore;
      el("profile-puppet-master").textContent = user.puppetMasterPercent === null ? "—" : user.puppetMasterPercent + "%";
    }
  }

  function showScreen(screen) {
    var profile = screen === "profile" && state.user;
    var leaderboard = screen === "leaderboard" && state.user;
    el("play-screen").hidden = !!profile || !!leaderboard;
    el("leaderboard-screen").hidden = !leaderboard;
    el("profile-screen").hidden = !profile;
    el("play-button").classList.toggle("active", !profile && !leaderboard);
    el("leaderboard-button").classList.toggle("active", !!leaderboard);
    el("account-button").classList.toggle("active", !!profile);
  }

  function renderLeaderboard(data) {
    var list = el("leaderboard-list");
    list.innerHTML = "";
    el("leaderboard-date-label").textContent = formatDate(data.date);
    el("leaderboard-previous-day").disabled = data.date <= state.startDate;
    el("leaderboard-next-day").disabled = data.date >= state.today;
    if (!data.entries.length) {
      el("leaderboard-message").textContent = "No verified finishes yet. The first score sets the pace.";
      return;
    }
    el("leaderboard-message").textContent = "";
    data.entries.forEach(function (entry) {
      var row = document.createElement("article");
      row.className = "leaderboard-row" + (entry.isCurrentUser ? " current-player" : "");
      row.setAttribute("role", "listitem");
      var place = document.createElement("strong");
      place.className = "leaderboard-place";
      place.textContent = String(entry.place);
      var player = document.createElement("span");
      player.className = "leaderboard-player";
      player.textContent = entry.username + (entry.isCurrentUser ? " (you)" : "");
      var rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = entry.rank;
      var score = document.createElement("strong");
      score.className = "leaderboard-score";
      score.textContent = entry.score;
      row.append(place, player, rank, score);
      list.append(row);
    });
  }

  async function loadLeaderboard(date) {
    state.leaderboardDate = date;
    el("leaderboard-date-label").textContent = formatDate(date);
    el("leaderboard-previous-day").disabled = date <= state.startDate;
    el("leaderboard-next-day").disabled = date >= state.today;
    el("leaderboard-list").setAttribute("aria-busy", "true");
    el("leaderboard-message").textContent = "Loading standings…";
    try { renderLeaderboard(await api("/api/leaderboard/" + date)); }
    catch (error) { el("leaderboard-message").textContent = error.message; }
    finally { el("leaderboard-list").removeAttribute("aria-busy"); }
  }

  function findNode(node, id) { if (node.id === id) return node; for (var i=0;i<node.children.length;i++) { var found=findNode(node.children[i],id); if(found)return found; } return null; }
  function renderSegments(segments, wrap) {
    (segments || []).forEach(function(segment){if(segment.text!==undefined)wrap.append(document.createTextNode(segment.text));else wrap.append(renderNode(segment.child));});
  }
  function renderNode(node) {
    var wrap = document.createElement("span"); wrap.className="clue-wrap";
    if(node.synthetic){renderSegments(node.segments,wrap);return wrap;}
    if(node.solved){wrap.append(document.createTextNode(node.display));return wrap;}
    if(node.ready){var button=document.createElement("button");button.className="clue-button"+(state.selected===node.id?" active":"");button.dataset.id=node.id;button.textContent=(node.peek?"("+node.peek+") ":"")+"["+node.clue+"]";button.addEventListener("click",function(){selectClue(node.id);});wrap.append(button);}
    else {wrap.append(document.createTextNode("["));renderSegments(node.segments,wrap);wrap.append(document.createTextNode("]"));}
    return wrap;
  }
  function positionHintMenu() {
    var menu=el("hint-actions");
    var node=state.selected&&findNode(state.puzzle.root,state.selected);
    var button=state.selected&&document.querySelector('.clue-button[data-id="'+state.selected+'"]');
    var show=!!(node&&button&&node.ready&&!node.solved&&!state.shareId);
    menu.hidden=!show;
    if(!show)return;
    el("reveal-button").hidden=!node.peek;
    el("peek-button").hidden=!!node.peek;
    var rect=button.getBoundingClientRect();
    menu.style.left=(rect.left+rect.width/2)+"px";
    menu.style.top=(rect.top-8)+"px";
  }
  function selectClue(id) { state.selected=state.selected===id?null:id; el("game-message").textContent=""; render(); setTimeout(positionHintMenu,0); }
  function render(data) {
    if(data){state.puzzle=data.puzzle;state.shareId=data.shareId;state.perfectInputDisqualified=data.puppetMasterEligible===false;el("score").textContent=data.score;el("rank").textContent=data.rank;if(data.user)updateUser(data.user);}
    el("puzzle-date").textContent=formatDate(state.puzzle.date);el("puzzle-title").textContent=state.puzzle.title;el("previous-day").disabled=state.date<=state.startDate;el("next-day").disabled=state.date>=state.today;
    var puzzle=el("puzzle");puzzle.innerHTML="";puzzle.append(renderNode(state.puzzle.root));
    el("complete-panel").hidden=!state.shareId;el("answer-panel").hidden=!!state.shareId;positionHintMenu();
    if(state.shareId){el("final-score").textContent=data?data.score:el("score").textContent;el("final-rank").textContent=data?data.rank:el("rank").textContent;el("fact").textContent=state.puzzle.fact;}
  }
  async function loadPuzzle(date){state.date=date;state.selected=null;try{render(await api("/api/puzzle/"+date));}catch(error){el("game-message").textContent=error.message;}}
  async function action(type,guess){try{var payload={action:type,guess:guess};if(type==="guess")payload.perfectKeystrokes=!state.perfectInputDisqualified;else payload.clueId=state.selected;var data=await api("/api/puzzle/"+state.date+"/action",{method:"POST",body:JSON.stringify(payload)});if(type==="guess"&&!data.solvedClueId)el("game-message").textContent="Not quite. Two points deducted.";else el("game-message").textContent="";render(data);return data;}catch(error){el("game-message").textContent=error.message;}}
  function disqualifyPerfectInput() {
    if(state.perfectInputDisqualified||state.shareId)return;
    state.perfectInputDisqualified=true;
    state.perfectInputSync=action("disqualifyPerfect");
  }
  function openAuth(mode){state.authMode=mode||"login";el("auth-dialog").showModal();setAuthMode(state.authMode);}
  function setAuthMode(mode){state.authMode=mode;var login=mode==="login";el("login-tab").classList.toggle("active",login);el("register-tab").classList.toggle("active",!login);el("auth-title").textContent=login?"Welcome back":"Claim your record";el("auth-submit").textContent=login?"Sign in":"Create account";el("password").autocomplete=login?"current-password":"new-password";el("auth-error").textContent="";}
  async function boot(){var data=await api("/api/me");state.date=data.today;state.leaderboardDate=data.today;state.today=data.today;state.startDate=data.startDate;updateUser(data.user);showScreen("play");if(data.user)await loadPuzzle(data.today);}

  el("account-button").addEventListener("click",function(){if(state.user)showScreen("profile");else openAuth("login");});
  el("play-button").addEventListener("click",function(){showScreen("play");});
  el("leaderboard-button").addEventListener("click",function(){showScreen("leaderboard");loadLeaderboard(state.leaderboardDate || state.today);});
  el("logout-button").addEventListener("click",async function(){await api("/api/logout",{method:"POST"});location.reload();});
  el("guest-signin").addEventListener("click",function(){openAuth("register");});el("close-dialog").addEventListener("click",function(){el("auth-dialog").close();});el("login-tab").addEventListener("click",function(){setAuthMode("login");});el("register-tab").addEventListener("click",function(){setAuthMode("register");});
  el("auth-form").addEventListener("submit",async function(event){event.preventDefault();try{var data=await api("/api/"+state.authMode,{method:"POST",body:JSON.stringify({username:el("username").value,password:el("password").value})});updateUser(data.user);showScreen("play");el("auth-dialog").close();await loadPuzzle(state.date);}catch(error){el("auth-error").textContent=error.message;}});
  el("answer-form").addEventListener("submit",async function(event){event.preventDefault();var value=el("answer-input").value;el("answer-input").value="";if(state.perfectInputSync)await state.perfectInputSync;action("guess",value);});el("peek-button").addEventListener("click",function(){action("peek");});el("reveal-button").addEventListener("click",function(){action("reveal");});
  el("answer-input").addEventListener("keydown",function(event){if(event.key==="Backspace"||event.key==="Delete")disqualifyPerfectInput();});
  el("answer-input").addEventListener("beforeinput",function(event){var replacing=event.inputType.indexOf("insert")===0&&this.selectionStart!==this.selectionEnd;if(event.inputType.indexOf("delete")===0||event.inputType==="historyUndo"||event.inputType==="historyRedo"||event.inputType==="insertFromPaste"||event.inputType==="insertFromDrop"||event.inputType==="insertReplacementText"||replacing)disqualifyPerfectInput();});
  el("answer-input").addEventListener("cut",disqualifyPerfectInput);el("answer-input").addEventListener("paste",disqualifyPerfectInput);el("answer-input").addEventListener("drop",disqualifyPerfectInput);
  el("previous-day").addEventListener("click",function(){if(!el("previous-day").disabled)loadPuzzle(moveDate(state.date,-1));});el("next-day").addEventListener("click",function(){if(!el("next-day").disabled)loadPuzzle(moveDate(state.date,1));});
  el("leaderboard-previous-day").addEventListener("click",function(){if(!el("leaderboard-previous-day").disabled)loadLeaderboard(moveDate(state.leaderboardDate,-1));});el("leaderboard-next-day").addEventListener("click",function(){if(!el("leaderboard-next-day").disabled)loadLeaderboard(moveDate(state.leaderboardDate,1));});window.addEventListener("resize",positionHintMenu);window.addEventListener("scroll",positionHintMenu,true);
  el("share-button").addEventListener("click",async function(){var url=location.origin+"/share/"+state.shareId;var text=state.user.username+" scored ("+el("score").textContent+"/100) · "+el("rank").textContent+" · "+state.puzzle.date;if(navigator.share){try{await navigator.share({title:"Bracket Verified",text:text,url:url});return;}catch(_){} }await navigator.clipboard.writeText(url);el("share-help").textContent="Verified link copied. Paste it into iMessage.";});
  boot().catch(function(){updateUser(null);});
})();
