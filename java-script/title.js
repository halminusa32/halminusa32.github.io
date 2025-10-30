function title_typeWriter() {
  const titletext = "鳩/てぃの公式サイト";
  const target = document.getElementById("title_typewriter");
  let i = 0;

  function typing() {
    if (i < titletext.length) {
      target.textContent += titletext.charAt(i);
      i++;
      setTimeout(typing, 100);
    }
  }

  typing();
}

document.addEventListener("DOMContentLoaded", title_typeWriter);
