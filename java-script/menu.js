const menuButton = document.getElementById("menuButton");
const sideMenu = document.getElementById("sideMenu");

menuButton.addEventListener("click", () => {
  sideMenu.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (sideMenu.classList.contains("open") && !sideMenu.contains(e.target) && e.target !== menuButton) {
    sideMenu.classList.remove("open");
  }
});
