// RouteController — owns route state and DOM visibility for top-level screens.
// Does NOT import any other app module.

export class RouteController {
  constructor({ dom }) {
    this._dom = dom;
    // dom: { startScreen, configScreen, app } — HTMLElements or IDs
    this._route = 'start';
  }

  setRoute(route) {
    this._route = route;
    const els = this._resolveElements();
    if (els.startScreen) els.startScreen.style.display = route === 'start' ? 'flex' : 'none';
    if (els.configScreen) els.configScreen.style.display = route === 'config' ? 'grid' : 'none';
    if (els.app) els.app.style.display = route === 'battle' ? 'grid' : 'none';
  }

  getRoute() {
    return this._route;
  }

  is(route) {
    return this._route === route;
  }

  _resolveElements() {
    if (typeof this._dom.startScreen === 'string') {
      return {
        startScreen: document.getElementById(this._dom.startScreen),
        configScreen: document.getElementById(this._dom.configScreen),
        app: document.getElementById(this._dom.app),
      };
    }
    return this._dom;
  }
}
