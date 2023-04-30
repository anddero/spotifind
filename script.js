// UTIL

function map(arr, mapper) {
    let newArr = [];
    for (let i = 0; i < arr.length; ++i) {
        let newEl = mapper(arr[i]);
        newArr.push(newEl);
    }
    return newArr;
}

function zip(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        throw new Error('Arrays must have the same length');
    }
    return arr1.map((el, i) => [el, arr2[i]]);
}

function mapOver(arr, mapper) {
    for (let i = 0; i < arr.length; ++i) {
        mapper(arr[i]);
    }
    return arr;
}

function count(arr, predicate) {
    let c = 0;
    for (let i = 0; i < arr.length; ++i) {
        if (predicate(arr[i]) === true) ++c;
    }
    return c;
}

function findAll(arr, predicate) {
    let indexes = [];
    for (let i = 0; i < arr.length; ++i) {
        if (predicate(arr[i]) === true) indexes.push(i);
    }
    return indexes;
}

function segmentArray(arr, segLen) {
    if (segLen <= 0) throw 'Segment length must be higher than 0';
    const newArr = [];
    for (let i = 0; i < arr.length; i += segLen) {
        newArr.push(arr.slice(i, i + segLen));
    }
    return newArr;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithInterval(arr, mapper, ms) {
    let newArr = [];
    for (let i = 0; i < arr.length; ++i) {
        let newEl = mapper(arr[i]);
        newArr.push(newEl);
        await wait(ms);
    }
    return newArr;
}

function escapeQuotesCsv(str) {
    return str.replace(/"/g, '""');
}

function addQuotes(str) {
    return '"' + str + '"';
}

function createCsvLine(lineArr) {
    return map(lineArr, (el) => addQuotes(escapeQuotesCsv(el))).join(";");
}

function downloadStringAsFile(str, filename) {
    const blob = new Blob([str], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

class AsyncExecutor {
    constructor() {
        this.running = false;
    }
    stop() {
        this.running = false;
    }
    async start() {
        this.running = true;
        while (this.running) {
            this.singleJobRunImpl();
            await wait(200);
        }
    }
    togglePause() {
        if (this.running) {
            this.stop();
        } else {
            this.start();
        }
    }
    singleJobRunImpl() {
        console.error('AsyncExecutor singleJobRunImpl not implemented');
    }
}

class AsyncJobExecutor extends AsyncExecutor {
    constructor() {
        super();
        this.jobQueue = [];
    }
    schedule(job) {
        this.jobQueue.push(job);
    }
    singleJobRunImpl() {
        if (this.jobQueue.length > 0) this.jobQueue.shift()()
    }
}

class AsyncRepeatingExecutor extends AsyncExecutor {
    constructor(job) {
        super();
        this.job = job;
    }
    singleJobRunImpl() {
        this.job();
    }
}

// APP

function logAndDisplayError(error, respArea) {
    console.error('error', error);
    respArea.innerText = "an error occurred, see console";
}

function logAndDisplayResponse(response, respArea) {
    console.log('response', response);
    respArea.innerText = JSON.stringify(response, null, 4);
}

function parseFetchAsJson(response) {
    return response.json().then(obj => {
        if (obj.error != null) throw obj;
        return obj;
    });
}

function spotifyGenToken(clientId, clientSecret) {
    const url = 'https://accounts.spotify.com/api/token';

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    return fetch(url, {
        method: 'POST',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
            // 'Authorization': 'Basic ' + (new Buffer().from(clientId + ':' + clientSecret).toString('base64'))
        },
        body: params.toString()
    }).then(parseFetchAsJson);
}

function spotifyFind(prompt, token) {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(prompt)}&type=track&limit=1`;

    return fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    }).then(parseFetchAsJson)
        .then(responseJson => {
            return map(responseJson.tracks.items, (item) => ({
                        name: item.name,
                        artists: map(item.artists, (artist) => artist.name),
                        id: item.id,
                        durationMs: item.duration_ms
                    }));
        }).then(cleanArr => {
            return map(cleanArr, (item) => ({
                fullStr: item.name + ' - ' + item.artists.join(', '),
                id: item.id,
                durationMs: item.durationMs
            }));
        });
}

function spotifyLike(songIds, token) {
    if (songIds.length > 20) throw 'Can like only up to 20 songs at a time';
    const url = `https://api.spotify.com/v1/me/tracks?ids=${songIds.join(',')}`;
    return fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    }).then(response => ({
            status: 'success',
            response: response.status,
            songIds: songIds.join(',')
        }));
}

async function spotifyFindNoThrow(prompt, token) {
    try {
        return await spotifyFind(prompt, token);
    } catch (error) {
        return [{
            fullStr: 'api-error',
            id: '',
            durationMs: -1
        }];
    }
}

async function spotifyLikeNoThrow(songIds, token) {
    try {
        return await spotifyLike(songIds, token);
    } catch (error) {
        return {
            status: 'error',
            response: error,
            songIds: songIds.join(',')
        };
    }
}

async function spotifyFindAll(promptArr, token) {
    return Promise.all(await mapWithInterval(promptArr, (prompt) => spotifyFindNoThrow(prompt, token), 100));
}

async function spotifyLikeAll(songIds, token) {
    const segments = segmentArray(songIds, 20);
    return Promise.all(await mapWithInterval(segments, (seg) => spotifyLikeNoThrow(seg, token), 300));
}

async function redirectToAuthCodeFlow(clientId) {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:63342/spotifind/");
    params.append("scope", "user-library-modify");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function getSensitiveAccessToken(clientId, code) {
    const verifier = localStorage.getItem("verifier");

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://localhost:63342/spotifind/");
    params.append("code_verifier", verifier);

    return fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    }).then(parseFetchAsJson)
        .then(response => response.access_token);
}

// UI

function downloadAll(promptArr, respArea) {
    const tokenInput = document.getElementById('token-input');
    spotifyFindAll(promptArr, tokenInput.value)
        .then(cleanArr => {
            return map(cleanArr, (item) => {
                if (item.length > 0) return item[0];
                return {
                    fullStr: 'no-results',
                    id: '',
                    durationMs: -1
                };
            });
        }).then(response => {
            logAndDisplayResponse(response, respArea);
            return response;
        }).then(cleanArr => {
            const promptArrNoQuotes = map(promptArr, escapeQuotesCsv);
            if (promptArrNoQuotes.length !== cleanArr.length) {
                throw {
                    error: 'Results array has invalid length',
                    results: cleanArr
                };
            }
            const zipped = promptArrNoQuotes.map((el, i) => [el, cleanArr[i].fullStr, cleanArr[i].id]);
            const csvLines = zipped.map(createCsvLine);
            downloadStringAsFile('"query";"name";"id"\n' + csvLines.join('\n'), 'SideBySide.csv');
            const onlyIds = cleanArr.map((el) => el.id);
            downloadStringAsFile(onlyIds.join('\n'), 'IDs.txt');
            const onlyNames = cleanArr.map((el) => el.fullStr);
            downloadStringAsFile(onlyNames.join('\n'), 'Names.txt');
        }).catch(error => logAndDisplayError(error, respArea));
}

function likeAll(songIds, respArea) {
    const tokenInput = document.getElementById('token-input');
    spotifyLikeAll(songIds, tokenInput.value)
        .then(response => {
            logAndDisplayResponse(response, respArea);
            return response;
        }).then(respArr => {
            downloadStringAsFile(JSON.stringify(respArr, null, 4), 'LikeResults.json');
        }).catch(error => logAndDisplayError(error, respArea));
}

function bindUiToken(respArea) {
    const getButton = document.getElementById('token-button');
    getButton.onclick = () => {
        const clientIdInput = document.getElementById('client-id-input');
        const secretInput = document.getElementById('secret-input');
        spotifyGenToken(clientIdInput.value, secretInput.value)
            .then(response => logAndDisplayResponse(response, respArea))
            .catch(error => logAndDisplayError(error, respArea));
    };
}

function bindUiSearch(respArea) {
    const findButton = document.getElementById('find-button');
    findButton.onclick = () => {
        const tokenInput = document.getElementById('token-input');
        const findInput = document.getElementById('find-input');
        spotifyFind(findInput.value, tokenInput.value)
            .then(response => logAndDisplayResponse(response, respArea))
            .catch(error => logAndDisplayError(error, respArea));
    };
}

function bindUiFindAll(respArea) {
    const fileInput = document.getElementById('file-input');
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (!file) throw 'no file selected';
        const reader = new FileReader();
        reader.onload = function(event) {
            const contents = event.target.result;
            const lines = contents.split(/\r?\n/);
            downloadAll(lines, respArea);
        };
        reader.readAsText(file);
    };
}

function bindUiLike(respArea) {
    const likeButton = document.getElementById('like-button');
    likeButton.onclick = () => {
        const tokenInput = document.getElementById('token-input');
        const songIdInput = document.getElementById('song-id-input');
        spotifyLike(songIdInput.value.split(','), tokenInput.value)
            .then(response => logAndDisplayResponse(response, respArea))
            .catch(error => logAndDisplayError(error, respArea));
    };
}

function bindUiLikeAll(respArea) {
    const fileInput = document.getElementById('like-file-input');
    fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (!file) throw 'no file selected';
        const reader = new FileReader();
        reader.onload = function(event) {
            const contents = event.target.result;
            const lines = contents.split(/\r?\n/);
            likeAll(lines, respArea);
        };
        reader.readAsText(file);
    };
}

function bindUiAuth() {
    const authButton = document.getElementById('auth-button');
    authButton.onclick = () => {
        const clientIdInput = document.getElementById('client-id-input');
        redirectToAuthCodeFlow(clientIdInput.value);
    };
}

function generateTokenIfAuth(respArea) {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
        console.log('code', code);
        const clientIdInput = document.getElementById('client-id-input');
        getSensitiveAccessToken(clientIdInput.value, code)
            .then(token => logAndDisplayResponse(token, respArea))
            .catch(error => logAndDisplayError(error, respArea));
    } else {
        console.log('no code');
    }
}

const respArea = document.getElementById('response-container');
respArea.innerText = "no response yet";
bindUiToken(respArea);
bindUiSearch(respArea);
bindUiFindAll(respArea);
bindUiLike(respArea);
bindUiLikeAll(respArea);
bindUiAuth();
generateTokenIfAuth(respArea);
