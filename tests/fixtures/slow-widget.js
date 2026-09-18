await new Promise((resolve) => setTimeout(resolve, 250));

class SlowWidget extends HTMLElement {}

if (!customElements.get("slow-widget")) {
  customElements.define("slow-widget", SlowWidget);
}
