class StateWidget extends HTMLElement {
  connectedCallback() {
    this.dataset.connectedCount = String(Number(this.dataset.connectedCount || "0") + 1);
  }

  connectedMoveCallback() {}
}

if (!customElements.get("state-widget")) {
  customElements.define("state-widget", StateWidget);
}
