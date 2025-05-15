// --- GLOBAALIT MUUTTUJAT JA VAKIOT ---
let player;
let library = {
    folders: [],
    videos: {},
    settings: {
        lastOpenedFolderId: 'root',
        activeVideoId: null
    }
};
let currentVideoId = null;
let currentFolderId = 'root'; // Oletuksena 'root'

const LOCAL_STORAGE_KEY = 'tagnote_library_v3';

// UUSI LIPPU API:n valmiudelle
let youtubeApiReady = false;
// JONO SOITTIMEN LUONTIPYYNNÖILLE (jos yritetään luoda ennen API:n valmiutta)
let playerInitializationQueue = [];


// --- DOM-ELEMENTIT ---
const urlInput = document.getElementById('youtube-url');
const loadVideoBtn = document.getElementById('load-video-btn');
const playerDivId = 'player';
const playerPlaceholder = document.getElementById('player-placeholder');
const commentTextInput = document.getElementById('comment-text');
const addCommentBtn = document.getElementById('add-comment-btn');
const commentsListUL = document.getElementById('comments-list');
const videoLibraryListUL = document.getElementById('video-library-list');
const commentsHeader = document.getElementById('comments-header');

const newFolderNameInput = document.getElementById('new-folder-name');
const addFolderBtn = document.getElementById('add-folder-btn');
const folderListUL = document.getElementById('folder-list');
const videoListHeader = document.getElementById('video-list-header');

// --- ALUSTUS ---
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    loadYouTubeAPI(); // Aloita API:n lataus
    loadLibraryFromLocal();
    
    currentFolderId = library.settings.lastOpenedFolderId || 'root';
    
    renderFolderList();
    renderVideoLibraryList();
    
    const initialVideoId = library.settings.activeVideoId;
    if (initialVideoId && library.videos[initialVideoId]) {
        if (youtubeApiReady) {
            selectVideoFromLibrary(initialVideoId);
        } else {
            playerInitializationQueue.push(() => selectVideoFromLibrary(initialVideoId));
        }
    } else {
         playerPlaceholder.classList.remove('hidden');
    }

    updateUIBasedOnState();

    loadVideoBtn.addEventListener('click', handleLoadNewUrlVideo);
    addCommentBtn.addEventListener('click', handleAddComment);
    commentsListUL.addEventListener('click', handleCommentListClick);
    addFolderBtn.addEventListener('click', handleAddFolder);
    folderListUL.addEventListener('click', handleFolderListClick);
    videoLibraryListUL.addEventListener('click', handleVideoLibraryClick);
}

function loadYouTubeAPI() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube IFrame API on valmis.");
    youtubeApiReady = true;
    processPlayerInitializationQueue();
};

function processPlayerInitializationQueue() {
    while (playerInitializationQueue.length > 0) {
        const initFunction = playerInitializationQueue.shift();
        initFunction();
    }
}

// --- UUID Generaattori ---
function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

// --- KANSIOIDEN HALLINTA ---
function handleAddFolder() {
    const folderName = newFolderNameInput.value.trim();
    if (!folderName) {
        alert("Anna kansiolle nimi.");
        return;
    }
    if (library.folders.find(f => f.name.toLowerCase() === folderName.toLowerCase())) {
        alert("Samanniminen kansio on jo olemassa.");
        return;
    }

    const newFolder = {
        id: generateUUID(),
        name: folderName
    };
    library.folders.push(newFolder);
    library.folders.sort((a,b) => a.name.localeCompare(b.name));

    saveLibraryToLocal();
    renderFolderList();
    newFolderNameInput.value = '';
    selectFolder(newFolder.id);
}

function handleFolderListClick(event) {
    const target = event.target;
    const folderLi = target.closest('li[data-folder-id]');

    if (target.classList.contains('delete-folder-btn')) {
        event.stopPropagation();
        const folderId = target.closest('li[data-folder-id]').dataset.folderId;
        if (folderId && folderId !== 'root') {
            handleDeleteFolder(folderId);
        }
    } else if (folderLi) {
        const folderIdToSelect = folderLi.dataset.folderId;
        selectFolder(folderIdToSelect);
    }
}

function selectFolder(folderId) {
    currentFolderId = folderId;
    library.settings.lastOpenedFolderId = currentFolderId;
    saveLibraryToLocal();
    
    renderFolderList();
    renderVideoLibraryList();
    updateVideoListHeader();
    updateUIBasedOnState();
}

function handleDeleteFolder(folderIdToDelete) {
    const folder = library.folders.find(f => f.id === folderIdToDelete);
    if (!folder) return;

    if (confirm(`Haluatko varmasti poistaa kansion "${folder.name}"? \nKansion videot siirretään pääkansioon.`)) {
        Object.values(library.videos).forEach(video => {
            if (video.folderId === folderIdToDelete) {
                video.folderId = null;
            }
        });

        library.folders = library.folders.filter(f => f.id !== folderIdToDelete);
        
        if (currentFolderId === folderIdToDelete) {
            selectFolder('root');
        } else {
             renderFolderList(); // Vain kansiolista tarvitsee päivityksen jos poistettu ei ollut aktiivinen
        }
        saveLibraryToLocal();
        // renderVideoLibraryList() kutsutaan selectFolderin kautta tai jos kansio ei ollut aktiivinen,
        // niin sen videolista ei muutu. Pääkansion videolista voi muuttua, joten se pitää päivittää,
        // jos aktiivinen kansio on 'root'. selectFolder('root') hoitaa tämän.
    }
}

function renderFolderList() {
    folderListUL.innerHTML = '';

    const rootLi = document.createElement('li');
    rootLi.dataset.folderId = 'root';
    if (currentFolderId === 'root') {
        rootLi.classList.add('active-folder');
    }
    const rootNameSpan = document.createElement('span');
    rootNameSpan.className = 'folder-name';
    rootNameSpan.textContent = 'Pääkansio';
    rootNameSpan.title = 'Videot, jotka eivät ole missään kansiossa';
    rootLi.appendChild(rootNameSpan);
    folderListUL.appendChild(rootLi);

    library.folders.forEach(folder => {
        const li = document.createElement('li');
        li.dataset.folderId = folder.id;
        if (folder.id === currentFolderId) {
            li.classList.add('active-folder');
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name';
        nameSpan.textContent = folder.name;
        nameSpan.title = folder.name;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-folder-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = `Poista kansio "${folder.name}"`;
        
        li.appendChild(nameSpan);
        li.appendChild(deleteBtn);
        folderListUL.appendChild(li);
    });
}

// --- VIDEON HALLINTA ---
function extractVideoId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function handleLoadNewUrlVideo() {
    const url = urlInput.value.trim();
    if (!url) {
        alert("Syötä YouTube-videon URL-osoite.");
        return;
    }
    const videoId = extractVideoId(url);
    if (!videoId) {
        alert("Virheellinen YouTube URL tai videota ei löytynyt.");
        return;
    }
    urlInput.value = '';
    
    const loadAction = () => {
        if (library.videos[videoId]) {
            selectVideoFromLibrary(videoId); // Tämä hoitaa myös kansion vaihdon tarvittaessa
        } else {
            loadVideoIntoPlayer(videoId); // onPlayerReadyInternal hoitaa lisäyksen kirjastoon
        }
    };

    if (youtubeApiReady) {
        loadAction();
    } else {
        playerInitializationQueue.push(loadAction);
    }
}

function loadVideoIntoPlayer(videoId) {
    if (!youtubeApiReady) {
        console.warn("YT API not ready, queuing loadVideoIntoPlayer for", videoId);
        playerInitializationQueue.push(() => loadVideoIntoPlayer(videoId));
        return;
    }

    playerPlaceholder.classList.add('hidden');
    if (player) {
        if (typeof player.cueVideoById === 'function') {
            player.cueVideoById(videoId);
        } else {
            console.error("Player object exists, but cueVideoById is not a function. Re-initializing player.");
            destroyPlayer();
            createPlayer(videoId);
        }
    } else {
        createPlayer(videoId);
    }
}

function createPlayer(videoId) {
    if (!youtubeApiReady) {
        console.error("Attempted to create player when YT API not ready. This should not happen.");
        playerInitializationQueue.push(() => createPlayer(videoId));
        return;
    }
    try {
        player = new YT.Player(playerDivId, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: { 'playsinline': 1, 'modestbranding': 1, 'rel': 0 },
            events: { 'onReady': onPlayerReadyInternal }
        });
    } catch (e) {
        console.error("Error creating YT.Player:", e);
    }
}

function destroyPlayer() {
    if (player && typeof player.destroy === 'function') {
        try {
            player.destroy();
        } catch (e) {
            console.error("Error destroying player instance:", e);
        }
    }
    player = null;
    const playerElement = document.getElementById(playerDivId);
    if (playerElement) {
        playerElement.innerHTML = ''; // Varmista, että iframe poistuu
    }
}

function onPlayerReadyInternal(event) {
    console.log("Player ready internal for video event on video ID:", event.target.getVideoData().video_id);
    // Soitin on event.target, koska globaali 'player' ei välttämättä ole vielä päivittynyt tähän instanssiin
    const newPlayerInstance = event.target;
    const videoData = newPlayerInstance.getVideoData();
    const videoIdFromPlayer = videoData.video_id;
    const videoTitle = videoData.title || "Nimetön Video";

    currentVideoId = videoIdFromPlayer;

    let videoEntry = library.videos[currentVideoId];
    if (!videoEntry) {
        videoEntry = {
            id: currentVideoId,
            title: videoTitle,
            folderId: (currentFolderId !== 'root' ? currentFolderId : null),
            comments: [],
            addedDate: new Date().toISOString()
        };
        library.videos[currentVideoId] = videoEntry;
        console.log(`Added new video to library: ${videoTitle} (ID: ${currentVideoId}) in folder: ${currentFolderId}`);
    } else {
        if (!videoEntry.title || videoEntry.title === "Nimetön Video") {
            videoEntry.title = videoTitle;
            console.log(`Updated title for video ID ${currentVideoId} to: ${videoTitle}`);
        }
        // Varmistetaan, että videon folderId on oikein, jos se ladataan uudelleen URL:sta
        // ja se on jo kirjastossa mutta käyttäjä on eri kansiossa.
        // Tämä on tärkeää, jos video ladataan URL:sta eikä valita kirjastosta.
        const expectedFolderId = (currentFolderId !== 'root' ? currentFolderId : null);
        if (videoEntry.folderId !== expectedFolderId && !library.folders.find(f => f.id === videoEntry.folderId) && videoEntry.folderId !== null) {
            // Jos videon folderId on virheellinen (kansiota ei enää ole), tai se on eri kuin nykyinen aktiivinen kansio
            // ja video ladattiin URL:sta (ei valittu kirjastosta, jolloin kansio olisi jo vaihdettu).
            // Tässä tapauksessa video "siirretään" nykyiseen kansioon.
            console.log(`Video ${currentVideoId} was in folder ${videoEntry.folderId}, but current folder is ${currentFolderId}. Moving to current folder.`);
            videoEntry.folderId = expectedFolderId;
        }
    }
    
    library.settings.activeVideoId = currentVideoId;
    saveLibraryToLocal();
    renderVideoLibraryList();
    updateUIBasedOnState();
}

function selectVideoFromLibrary(videoIdToSelect) {
    const videoData = library.videos[videoIdToSelect];
    if (!videoData) {
        console.warn(`Video with ID ${videoIdToSelect} not found in library.`);
        return;
    }

    const selectAction = () => {
        currentVideoId = videoIdToSelect;
        library.settings.activeVideoId = currentVideoId;

        const targetFolderId = videoData.folderId || 'root';
        if (targetFolderId !== currentFolderId) {
            selectFolder(targetFolderId); // Tämä hoitaa UI-päivitykset ja videolistan renderöinnin
        } else {
            // Jos kansio on sama, varmista vain, että videolistan korostus on oikein
             updateActiveVideoInLibraryList(currentVideoId);
        }
        
        loadVideoIntoPlayer(videoIdToSelect); // Lataa video soittimeen
        saveLibraryToLocal(); // Tallenna aktiivisen videon muutos
        updateUIBasedOnState(); // Päivitä kommentit, otsikot jne.
    };
    
    if (youtubeApiReady) {
        selectAction();
    } else {
        playerInitializationQueue.push(selectAction);
    }
}


function handleVideoLibraryClick(event) {
    const target = event.target;
    const videoLi = target.closest('li[data-video-id]');

    if (target.classList.contains('delete-video-btn')) {
        event.stopPropagation();
        const videoId = target.closest('li[data-video-id]').dataset.videoId;
        if (videoId) handleRemoveVideo(videoId);
    } else if (target.tagName === 'SELECT' && target.closest('.video-actions')) {
        event.stopPropagation();
    } else if (videoLi) {
        const videoId = videoLi.dataset.videoId;
        if (videoId && videoId !== currentVideoId) { // Vain jos eri video valitaan
            selectVideoFromLibrary(videoId);
        } else if (videoId === currentVideoId && player && typeof player.playVideo === 'function') {
            // Jos sama video klikataan, ei tehdä mitään erityistä (tai voisi play/pause)
        }
    }
}

function handleRemoveVideo(videoIdToRemove) {
    const videoData = library.videos[videoIdToRemove];
    if (!videoData) return;

    if (confirm(`Haluatko varmasti poistaa videon "${videoData.title}" ja sen kaikki kommentit pysyvästi?`)) {
        delete library.videos[videoIdToRemove];
        
        if (currentVideoId === videoIdToRemove) {
            currentVideoId = null;
            library.settings.activeVideoId = null;
            destroyPlayer();
        }
        saveLibraryToLocal();
        renderVideoLibraryList(); // Päivitä videolista nykyisessä kansiossa
        updateUIBasedOnState();   // Päivitä koko UI:n tila
    }
}

function renderVideoLibraryList() {
    videoLibraryListUL.innerHTML = '';
    
    const videosInCurrentFolder = Object.values(library.videos).filter(video => {
        if (currentFolderId === 'root') return !video.folderId;
        return video.folderId === currentFolderId;
    }).sort((a,b) => new Date(b.addedDate) - new Date(a.addedDate));

    if (videosInCurrentFolder.length === 0) {
        const li = document.createElement('li');
        li.textContent = "Ei videoita tässä kansiossa.";
        li.style.fontStyle = "italic";
        li.style.color = "var(--text-secondary)";
        li.style.cursor = "default";
        videoLibraryListUL.appendChild(li);
    } else {
        videosInCurrentFolder.forEach(videoData => {
            const li = document.createElement('li');
            li.dataset.videoId = videoData.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'video-title';
            titleSpan.textContent = videoData.title || "Nimetön Video";
            titleSpan.title = videoData.title || "Nimetön Video";
            li.appendChild(titleSpan);

            const actionsContainer = document.createElement('div');
actionsContainer.className = 'video-actions';

            const selectMove = document.createElement('select');
            selectMove.title = "Siirrä video toiseen kansioon";
            selectMove.dataset.videoId = videoData.id; // Tärkeä handleMoveVideolle
            selectMove.addEventListener('change', handleMoveVideo);

            const defaultOpt = document.createElement('option');
            defaultOpt.textContent = "Siirrä...";
            defaultOpt.value = ""; // Tyhjä arvo, jotta change-event ei laukea turhaan
            defaultOpt.disabled = true;
            defaultOpt.selected = true;
            selectMove.appendChild(defaultOpt);

            if (videoData.folderId !== null) { // Jos video ei ole jo pääkansiossa
                const rootOpt = document.createElement('option');
                rootOpt.value = 'root';
                rootOpt.textContent = 'Pääkansioon';
                selectMove.appendChild(rootOpt);
            }
            
            library.folders.forEach(folder => {
                if (folder.id !== videoData.folderId) { // Älä näytä nykyistä kansiota vaihtoehtona
                    const opt = document.createElement('option');
                    opt.value = folder.id;
                    opt.textContent = folder.name;
                    selectMove.appendChild(opt);
                }
            });
            
            if (selectMove.options.length > 1) { // Näytä select vain jos on siirtovaihtoehtoja
                 actionsContainer.appendChild(selectMove);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-video-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = `Poista video "${videoData.title}"`;
            actionsContainer.appendChild(deleteBtn);
            
            li.appendChild(actionsContainer);
            videoLibraryListUL.appendChild(li);
        });
    }
    updateActiveVideoInLibraryList(library.settings.activeVideoId);
    updateVideoListHeader();
}

function handleMoveVideo(event) {
    const selectElement = event.target;
    const videoId = selectElement.dataset.videoId;
    const newFolderIdValue = selectElement.value;

    if (!videoId || newFolderIdValue === "") return;

    const video = library.videos[videoId];
    if (!video) return;

    video.folderId = (newFolderIdValue === 'root' ? null : newFolderIdValue);
    
    saveLibraryToLocal();
    renderVideoLibraryList(); // Päivitä videolista, video poistuu nykyisestä kansiosta jos se siirrettiin
    
    // Palauta selectin valinta "Siirrä..." tilaan
    selectElement.value = "";
}


function updateActiveVideoInLibraryList(activeVideoId) {
    document.querySelectorAll('#video-library-list li').forEach(item => {
        if (item.dataset.videoId === activeVideoId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// --- KOMMENTOINTI ---
function handleAddComment() {
    if (!player || typeof player.getCurrentTime !== 'function' || !currentVideoId || !library.videos[currentVideoId]) {
        alert("Valitse tai lataa video ensin ja varmista, että se on valmis.");
        return;
    }
    const commentText = commentTextInput.value.trim();
    if (!commentText) {
        alert("Kirjoita kommentti.");
        return;
    }
    const currentTime = Math.round(player.getCurrentTime());
    const newComment = { time: currentTime, text: commentText };

    library.videos[currentVideoId].comments.push(newComment);
    library.videos[currentVideoId].comments.sort((a, b) => a.time - b.time);

    saveLibraryToLocal();
    renderCommentsList();
    commentTextInput.value = '';
}

function renderCommentsList() {
    commentsListUL.innerHTML = '';
    if (!currentVideoId || !library.videos[currentVideoId] || library.videos[currentVideoId].comments.length === 0) {
        const li = document.createElement('li');
        li.textContent = "Ei kommentteja tälle videolle.";
        li.style.fontStyle = "italic";
        li.style.color = "var(--text-secondary)";
        commentsListUL.appendChild(li);
        return;
    }
    library.videos[currentVideoId].comments.forEach(comment => {
        const li = document.createElement('li');
        li.dataset.timestamp = comment.time;

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = formatTime(comment.time);

        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = comment.text;

        li.appendChild(timestampSpan);
        li.appendChild(textSpan);
        commentsListUL.appendChild(li);
    });
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function handleCommentListClick(event) {
    const clickedLi = event.target.closest('li[data-timestamp]');
    if (clickedLi && player && typeof player.seekTo === 'function') {
        const time = parseInt(clickedLi.dataset.timestamp, 10);
        player.seekTo(time, true);
        if (typeof player.playVideo === 'function') player.playVideo();
    }
}

// --- UI-PÄIVITYKSET ---
function updateVideoListHeader() {
    let headerText = "Videot: ";
    if (currentFolderId === 'root' || !currentFolderId) {
        headerText += "Pääkansio";
    } else {
        const folder = library.folders.find(f => f.id === currentFolderId);
        headerText += folder ? folder.name : "Pääkansio";
    }
    videoListHeader.textContent = headerText;
}

function updateCommentsHeader(videoTitle) {
    if (videoTitle) {
        commentsHeader.textContent = `Kommentit: ${videoTitle}`;
    } else if (currentVideoId && library.videos[currentVideoId]) {
        commentsHeader.textContent = `Kommentit: ${library.videos[currentVideoId].title}`;
    }
    else {
        commentsHeader.textContent = "Kommentit";
    }
}

function updateUIBasedOnState() {
    const videoIsSelectedAndExists = currentVideoId && library.videos[currentVideoId];
    const playerIsReadyAndExists = player && typeof player.getPlayerState === 'function';

    if (videoIsSelectedAndExists && playerIsReadyAndExists) {
        commentTextInput.disabled = false;
        addCommentBtn.disabled = false;
        updateCommentsHeader(library.videos[currentVideoId].title);
        renderCommentsList();
        playerPlaceholder.classList.add('hidden');
    } else {
        commentTextInput.disabled = true;
        addCommentBtn.disabled = true;
        updateCommentsHeader(); // Tyhjentää tai asettaa oletusotsikon
        commentsListUL.innerHTML = '<li style="font-style: italic; color: var(--text-secondary);">Valitse video näyttääksesi kommentit.</li>';
        
        // Näytä placeholder, jos soitinta ei ole, se ei ole valmis, tai videota ei ole valittu
        if (!playerIsReadyAndExists || !videoIsSelectedAndExists) {
            playerPlaceholder.classList.remove('hidden');
        } else if (playerIsReadyAndExists && ([YT.PlayerState.UNSTARTED, YT.PlayerState.ENDED, -1].includes(player.getPlayerState()))){
             // Jos soitin on olemassa mutta ei toista/puskuroi aktiivisesti, näytä placeholder
             // Tämä ehto voi olla liian aggressiivinen, jos halutaan että viimeisin frame jää näkyviin.
             // Poistetaan toistaiseksi tämä ehto, jotta placeholder näkyy vain jos soitin ei ole valmis TAI videota ei ole valittu.
            // playerPlaceholder.classList.remove('hidden');
        }
    }
    updateVideoListHeader();
    updateActiveVideoInLibraryList(library.settings.activeVideoId);
    renderFolderList();
}


// --- LOCALSTORAGE ---
function saveLibraryToLocal() {
    try {
        // Varmistetaan, että tallennettavat ID:t ovat valideja
        if (library.settings.activeVideoId && !library.videos[library.settings.activeVideoId]) {
            library.settings.activeVideoId = null;
        }
        if (library.settings.lastOpenedFolderId && library.settings.lastOpenedFolderId !== 'root' && !library.folders.find(f => f.id === library.settings.lastOpenedFolderId)) {
            library.settings.lastOpenedFolderId = 'root';
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(library));
    } catch (e) {
        console.error("Error saving to localStorage:", e);
        // Tässä voisi ilmoittaa käyttäjälle, että tallennus epäonnistui
    }
}

function loadLibraryFromLocal() {
    const defaultLibrary = {
        folders: [],
        videos: {},
        settings: { lastOpenedFolderId: 'root', activeVideoId: null }
    };
    try {
        const storedLibrary = localStorage.getItem(LOCAL_STORAGE_KEY);
        const parsed = storedLibrary ? JSON.parse(storedLibrary) : null;
        if (parsed) {
            library = {
                folders: Array.isArray(parsed.folders) ? parsed.folders : [],
                videos: typeof parsed.videos === 'object' && parsed.videos !== null ? parsed.videos : {},
                settings: {
                    lastOpenedFolderId: parsed.settings?.lastOpenedFolderId || 'root',
                    activeVideoId: parsed.settings?.activeVideoId || null
                }
            };
            
            if (library.settings.activeVideoId && !library.videos[library.settings.activeVideoId]) {
                console.warn(`Active video ID ${library.settings.activeVideoId} not found in loaded videos. Resetting.`);
                library.settings.activeVideoId = null;
            }
            if (library.settings.lastOpenedFolderId !== 'root' && !library.folders.find(f => f.id === library.settings.lastOpenedFolderId)) {
                console.warn(`Last opened folder ID ${library.settings.lastOpenedFolderId} not found. Resetting to root.`);
                library.settings.lastOpenedFolderId = 'root';
            }

        } else {
            library = defaultLibrary;
        }
    } catch (e) {
        console.error("Error loading or parsing from localStorage:", e);
        library = defaultLibrary;
    }
    currentFolderId = library.settings.lastOpenedFolderId || 'root';
}