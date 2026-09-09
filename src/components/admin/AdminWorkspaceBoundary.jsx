import React from 'react';
import { workspaceRecoveryKind } from '@/lib/adminCommandSystem';
export { WorkspaceSkeleton } from './WorkspaceSkeleton';

const RetryAttempt = React.createContext(0);

/** A failed lazy import needs a fresh React lazy payload on region retry. */
export function retryableLazy(loader) {
  const versions = new Map();
  return function LazyRegion(props) {
    const attempt = React.useContext(RetryAttempt);
    if (!versions.has(attempt)) {
      if (versions.size > 1) versions.clear();
      versions.set(attempt, React.lazy(loader));
    }
    const Component = versions.get(attempt);
    return <Component {...props} />;
  };
}

export class AdminWorkspaceBoundary extends React.Component {
  state = { failed: false, attempt: 0, recovery: 'retry' };
  static getDerivedStateFromError(error) { return { failed: true, recovery: workspaceRecoveryKind(error) }; }
  render() {
    if (this.state.failed) return <section className="admin-command-stage" role="alert"><h2>This workspace could not load</h2>{this.state.recovery === 'reload' ? <><p>The workspace download failed. Reload this page to retry the download; your exact URL, saved drafts and shell preferences are kept. Any unsaved changes require your confirmation.</p><button type="button" onClick={this.props.onReload || (() => window.location.reload())}>Reload workspace</button></> : <><p>Your current URL, search and filters are kept. Retry this region to recover.</p><button type="button" onClick={() => this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))}>Retry workspace</button></>}</section>;
    return <RetryAttempt.Provider key={this.state.attempt} value={this.state.attempt}>{this.props.children}</RetryAttempt.Provider>;
  }
}
