// Waking the MV3 worker establishes a connection only; it never starts generation.
(()=>{const wake=()=>chrome.runtime.sendMessage({type:'XYQ_CANVAS_WAKE'}).catch(()=>{});wake();setInterval(wake,5000);document.addEventListener('visibilitychange',wake);window.addEventListener('pageshow',wake);})();
