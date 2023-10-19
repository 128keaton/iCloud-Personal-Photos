document.addEventListener("DOMContentLoaded", () => {
    const imgElement = document.querySelector('img')

    if (!imgElement.complete)
        imgElement.classList.add('hide');

    imgElement.onload = imgElement.onerror = () => {
        imgElement.classList.remove('hide');
        imgElement.classList.add('show');
    };

    if (imgElement.complete) {
        imgElement.classList.remove('hide');
        imgElement.classList.add('show');
    }
});
