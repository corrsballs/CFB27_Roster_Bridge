let WORK = null;

let RAW = null;

let DIRTY = false;

let ASSIGN = {};

function changeBlip() {
    if (typeof document === "undefined") return;
    const b = document.getElementById("blip");
    if (!b) return;
    b.classList.remove("show");
    void b.offsetWidth;
    b.classList.add("show");
}
