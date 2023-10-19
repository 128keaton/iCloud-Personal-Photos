document.addEventListener("DOMContentLoaded", () => {
    const imgElement = document.querySelector('img')

    imgElement.classList.add('hide');

    imgElement.onload = imgElement.onerror = () => {
        imgElement.classList.remove('hide');
        imgElement.classList.add('show');
    };


});
