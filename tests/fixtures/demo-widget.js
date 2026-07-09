class DemoWidget extends HTMLElement {
  connectedCallback() {
    this.dataset.connectedCount = String(Number(this.dataset.connectedCount || "0") + 1);
    this.setAttribute("data-upgraded", "true");
    this.textContent = "upgraded";
  }
}

if (!customElements.get("demo-widget")) {
  customElements.define("demo-widget", DemoWidget);
}
