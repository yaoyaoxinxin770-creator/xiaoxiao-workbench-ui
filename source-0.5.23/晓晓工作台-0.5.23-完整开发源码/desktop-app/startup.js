window.startup.onState(state=>{document.getElementById('message').textContent=state.message;document.getElementById('error').textContent=state.error;for(const id of ['retry','logs'])document.getElementById(id).hidden=!state.error;});
for(const id of ['retry','logs','quit'])document.getElementById(id).addEventListener('click',()=>{void window.startup.action(id);});
