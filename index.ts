import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';
import getImages from "icloud-shared-album";
import path from "path";

import expressRedisCache from 'express-redis-cache';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || '5123';


const redisURL = process.env.REDIS_URL;

let cache;

if (!!redisURL && redisURL.includes('@')) {
    cache = expressRedisCache({
        auth_pass: redisURL.split('@')[0].split(':')[2],
        host: redisURL.split('@')[1].split(':')[0],
        port: parseInt(redisURL.split('@')[1].split(':')[1]),
    })
} else if (!!redisURL) {
    const splitRedisURL = redisURL.split(':');

    cache = expressRedisCache({
        host: splitRedisURL[1].split('//')[1],
        port: parseInt(splitRedisURL[2]),
    })
}

if (!cache)
    throw new Error('Caching failed');

app.set('view engine', 'pug')
app.set('views', `${__dirname}/views`)
app.use(express.static(path.join(__dirname, 'public')))

const albums = [
    {
        name: 'Kenya October 2023',
        slug: 'kenya-october-2023',
        token: 'B0O5yeZFhmSQuG',
        coverURL: '',
    }
];


const getAlbumImage = async (slug: string, photoID: string) => {
    const album = albums.find(album => album.slug === slug);

    if (!album)
        return null;


    const data = await getImages(album.token);
    let photoIndex = 0;

    const photo = data.photos.find((image, index) => {
        if (image.photoGuid === photoID) {
            photoIndex = index;
            return true;
        }

        return false;
    });

    let prevPhoto, nextPhoto;

    if (photoIndex > 0) {
        prevPhoto = data.photos[photoIndex - 1].photoGuid;
    }

    if (photoIndex <= data.photos.length) {
        nextPhoto = data.photos[photoIndex + 1].photoGuid;
    }

    const derivatives = Object.values(photo?.derivatives || {});
    const derivative = derivatives[derivatives.length - 1];

    if (!!derivative)
        return {
            ...photo,
            ...derivative,
            prevPhoto,
            nextPhoto
        };
}

const getAlbum = async (slug: string) => {
    const album = albums.find(album => album.slug === slug);

    if (!album)
        return null;


    const images: {
        thumbnail: string,
        id: string,
        fullImage: string;
    }[] = [];

    const data = await getImages(album.token);

    data.photos.forEach(image => {
        const derivatives = Object.keys(image.derivatives);
        const thumb = image.derivatives[derivatives[0]];
        const full = image.derivatives[derivatives[derivatives.length - 1]];

        if (!!thumb.url && !!full.url) {
            images.push({
                id: image.photoGuid,
                fullImage: full.url,
                thumbnail: thumb.url,
            })
        }
    })

    return images;
}

const getAlbums = async () => {
    for (let album of albums) {
        if (!album.coverURL.length) {
            const data = await getImages(album.token);
            if (data.photos.length > 0) {
                const firstPhoto = data.photos[0];
                const derivatives = Object.keys(firstPhoto.derivatives);
                const firstDerivative = firstPhoto.derivatives[derivatives[0]];

                album.coverURL = firstDerivative.url || '';
            }
        }
    }

    return albums;
}

app.get('/', async (req, res) => {
    const albums = await getAlbums();

    res.render('albums', {title: 'Albums', albums})
});


app.get('/:albumSlug', cache.route(), async (req: Request, res: Response) => {
    const album = albums.find(album => album.slug === req.params['albumSlug']);
    if (!album) {
        res.sendStatus(404);
        return;
    }


    const photos = await getAlbum(album.slug);

    res.render('album', {title: album.name, album, photos})
});

app.get('/:albumSlug/:photoID', cache.route(), async (req: Request, res: Response) => {
    const album = albums.find(album => album.slug === req.params['albumSlug']);
    if (!album) {
        res.sendStatus(404);
        return;
    }


    const photo = await getAlbumImage(album.slug, req.params['photoID']);

    res.render('photo', {title: album.name, album, photo, prevPhoto: photo?.prevPhoto, nextPhoto: photo?.nextPhoto})
});

app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
