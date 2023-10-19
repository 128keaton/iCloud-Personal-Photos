document.addEventListener("DOMContentLoaded", () => {
    const images = document.querySelectorAll('img')

    document.body.classList.add('no-scroll');

    let imagesLoaded = 0;

    const loading = document.querySelector('.loading');

    if (!!loading) {
        loading.classList.add('show');
        loading.innerText = `Loading ${imagesLoaded}/${images.length}`;
    }

    images.forEach(imgElement => {
        imgElement.classList.add('hide');
    });


    Promise.all(Array.from(document.images).filter(img => !img.complete).map(img => new Promise(resolve => {
        img.onload = img.onerror = () => {
            imagesLoaded += 1;
            if (!!loading) {
                loading.innerText = `Loading ${imagesLoaded}/${images.length}`;
            }
            return resolve();
        };
    }))).then(() => {
        if (!!loading) {
            loading.classList.remove('show');
            loading.classList.add('hide');
        }

        document.body.classList.remove('no-scroll');

        images.forEach(imgElement => {
            imgElement.classList.remove('hide');
            imgElement.classList.add('show');
        });
    });


});
