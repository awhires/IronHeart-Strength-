import React from 'react';

export default class AppErrorBoundary extends React.Component {
 state={failed:false,incident:0};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error,info){
  // No workout records, authentication values, or API payloads are logged.
  console.error('[Iron Heart render failure]',error,info.componentStack);
 }
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="main-content"><section className="panel" role="alert">
   <h1>This screen couldn’t open</h1>
   <p>Your saved workouts and pending saves have not been deleted. Unsaved edits on this screen may need to be entered again.</p>
   <button type="button" className="btn" onClick={()=>this.setState({failed:false,incident:this.state.incident+1})}>Return to Home</button>
   <button type="button" className="btn secondary" onClick={()=>window.location.reload()}>Reload app</button>
  </section></main>;
 }
}
