import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';
import getImages, {ICloud} from "icloud-shared-album";
import path from "path";
import axios from 'axios';

import expressRedisCache from 'express-redis-cache';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || '5123';


const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';

let cache: expressRedisCache.ExpressRedisCache | undefined = undefined;

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

app.enable('trust proxy');
app.set('view engine', 'pug')
app.set('views', `${__dirname}/views`)
app.use(express.static(path.join(__dirname, 'public')))

const albums = [
    {
        name: 'Kenya October 2023',
        slug: 'kenya-october-2023',
        token: 'B0O5yeZFhmSQuG',
        coverURL: '',
    },
    {
        name: 'Old Glass',
        slug: 'old-glass',
        token: 'B0O59UlCqCOk3T',
        coverURL: '',
    }
];


const getCacheItem = (key: string) => {
    return new Promise<expressRedisCache.Entry[]>((resolve, reject) => {
        if (!cache) {
            reject('No cache');
            return;
        }

        cache.get(key, (error, entries) => {
            if (!!error) {
                reject(error)
                return;
            }

            resolve(entries);
        })
    })
}

const cachedGetImages = async (token: string): Promise<ICloud.Response> => {
    if (!!cache) {
        const cachedItem = await getCacheItem(`${token}-images`);

        if (!!cachedItem && !!cachedItem[0]) {
            return JSON.parse(cachedItem[0].body);
        }
    }


    const data = await getImages(token);

    if (!!cache)
        cache.add(`${token}-images`, JSON.stringify(data), (error, added) => {
            if (!!error)
                console.error(error);
            else if (!!added)
                console.log(added);
        });

    return data;
}

const getAlbumImage = async (slug: string, photoID: string) => {

    if (!!cache) {
        const cachedItem = await getCacheItem(`${photoID}-photo`);

        if (!!cachedItem && !!cachedItem[0]) {
            return JSON.parse(cachedItem[0].body);
        }
    }

    const album = albums.find(album => album.slug === slug);

    if (!album)
        return null;


    const data = await cachedGetImages(album.token);
    let photoIndex = 0;

    const photo = data.photos.find((image, index) => {
        if (image.photoGuid === photoID) {
            photoIndex = index;
            return true;
        }

        return false;
    });

    let prevPhoto, nextPhoto;

    if (photoIndex > 0 && data.photos[photoIndex - 1]) {
        prevPhoto = data.photos[photoIndex - 1].photoGuid;
    }

    if (photoIndex <= data.photos.length && data.photos[photoIndex + 1]) {
        nextPhoto = data.photos[photoIndex + 1].photoGuid;
    }

    const derivatives = Object.keys(photo?.derivatives || {}).sort((a, b) => a.localeCompare(b));
    const highQuality = (photo?.derivatives || {})[derivatives[0]];

    let lowQuality: any = false;

    if (derivatives.length > 1) {
        lowQuality = (photo?.derivatives || {})[derivatives[derivatives.length - 1]];
    }


    if (!!highQuality || !!lowQuality) {
        const returnValue = {
            ...photo,
            ...(highQuality || lowQuality),
            prevPhoto: (!!prevPhoto ? prevPhoto : false),
            nextPhoto: (!!nextPhoto ? nextPhoto : false),
            thumbnail: lowQuality
        };

        if (!!cache)
            cache.add(`${photoID}-photo`, JSON.stringify(returnValue), (error, added) => {
                if (!!error)
                    console.error(error);
                else if (!!added)
                    console.log(added);
            });

        return returnValue;
    }

    return null;
}

const getAlbum = async (slug: string) => {
    if (!!cache) {
        const cachedItem = await getCacheItem(`${slug}-album`);

        if (!!cachedItem && !!cachedItem[0]) {
            return JSON.parse(cachedItem[0].body);
        }
    }

    const album = albums.find(album => album.slug === slug);

    if (!album)
        return null;


    const images: {
        thumbnail: string,
        id: string,
        fullImage: string;
    }[] = [];

    const data = await cachedGetImages(album.token);

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
    });

    if (!!cache)
        cache.add(`${slug}-album`, JSON.stringify(images), (error, added) => {
            if (!!error)
                console.error(error);
            else if (!!added)
                console.log(added);
        });

    return images;
}

const getAlbums = async () => {
    if (!!cache) {
        const cachedItem = await getCacheItem('albums');

        if (!!cachedItem && !!cachedItem[0]) {
            return JSON.parse(cachedItem[0].body);
        }
    }

    for (let album of albums) {
        if (!album.coverURL.length) {
            const data = await cachedGetImages(album.token);
            if (data.photos.length > 0) {
                const firstPhoto = data.photos[0];
                const derivatives = Object.keys(firstPhoto.derivatives);
                const firstDerivative = firstPhoto.derivatives[derivatives[0]];

                album.coverURL = firstDerivative.url || '';
            }
        }
    }

    if (!!cache)
        cache.add('albums', JSON.stringify(albums), (error, added) => {
            if (!!error)
                console.error(error);
            else if (!!added)
                console.log(added);
        });

    return albums;
}

if (process.env.NODE_ENV || 'development' !== 'development')
    app.use((req, res, next) => {
        req.secure ? next() : res.redirect('https://' + req.headers.host + req.url)
    })


app.get('/', async (req, res) => {
    const albums = await getAlbums();

    res.render('albums', {title: 'Albums', albums})
});

app.get('/reset', (req, res) => {
    if (!!cache) {
        cache.del('*', (error, deleted) => {
            if (!!error)
                res.send({error});
            else if (!!deleted)
                res.send({deleted});
        })
    } else {
        res.send({error: 'no cache'});
    }
});

const returnImage = async (res: Response, url: string) => {
    const response = await axios(url, {responseType: 'stream'}).catch(err => {
        console.error(err);
        return null;
    });


    if (!!response && !!response.data) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'max-age=86400');
        response.data.pipe(res);
    } else {
        res.sendStatus(404);
    }
}


app.get('/:albumSlug', cache.route(), async (req: Request, res: Response) => {
    const album = albums.find(album => album.slug === req.params['albumSlug']);
    if (!album) {
        res.sendStatus(404);
        return;
    }


    const photos = await getAlbum(album.slug);

    return res.render('album', {title: album.name, album, photos})
});


app.get('/:albumSlug/:photoID', cache.route(), async (req: Request, res: Response) => {
    const album = albums.find(album => album.slug === req.params['albumSlug']);
    if (!album) {
        res.sendStatus(404);
        return;
    }


    const photo = await getAlbumImage(album.slug, req.params['photoID']);

    return res.render('photo', {
        title: album.name,
        album,
        photo,
        prevPhoto: photo?.prevPhoto,
        nextPhoto: photo?.nextPhoto
    })
});


app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
