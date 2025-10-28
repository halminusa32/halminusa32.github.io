const hamburger = document.getElementById('hamburger');
const menu = document.getElementById('menu');

hamburger.addEventListener('click', function() {
  hamburger.classList.toggle('active');
  menu.classList.toggle('open');
});
