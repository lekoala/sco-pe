customElements.whenDefined("sco-pe").then(() => {
  // Access through registry
  customElements.get("sco-pe").configure({
    debug: true,
    onLoad: (el) => {
      el.querySelectorAll(".global-time").forEach((el) => {
        var now = new Date();
        el.innerText = now;
      });
    },
  });
});
