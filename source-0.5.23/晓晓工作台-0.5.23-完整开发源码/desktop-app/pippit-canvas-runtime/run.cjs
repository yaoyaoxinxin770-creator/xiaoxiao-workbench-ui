const {runCanvasCommand}=require('./scripts/canvas-command');
runCanvasCommand(process.argv.slice(3),{nativeInvocation:{command:process.argv[2]}}).then(code=>{process.exitCode=code||0;}).catch(error=>{console.error(error.message);process.exitCode=1;});
