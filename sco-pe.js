import Scope from "./src/Scope.js";

if (!customElements.get("sco-pe")) {
  customElements.define("sco-pe", Scope);
}

export default Scope;
