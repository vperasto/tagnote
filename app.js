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

const LOCAL_STORAGE_KEY = 'tagnote_library_v3'; // Päivitetty avain vianmääritystä varten, jos vanha data aiheuttaa ongelmia

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
    loadYouTubeAPI();
    loadLibraryFromLocal();
    
    currentFolderId = library.settings.lastOpenedFolderId || 'root';
    
    renderFolderList();
    renderVideoLibraryList();
    
    if (library.settings.activeVideoId && library.videos[library.settings.activeVideoId]) {
        selectVideoFromLibrary(library.settings.activeVideoId);
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
};

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
    updateUIBasedOnState(); // Varmista, että esim. soitin tyhjennetään, jos kansiossa ei ole aktiivista videota
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
            selectFolder('root'); // Valitse pääkansio, tämä hoitaa tilapäivitykset
        } else {
            // Jos poistettu kansio ei ollut aktiivinen, renderöi vain kansiolista uudelleen
             renderFolderList();
        }
        saveLibraryToLocal();
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
    
    if (library.videos[videoId]) {
        selectVideoFromLibrary(videoId);
        const videoFolder = library.videos[videoId].folderId || 'root';
        if (videoFolder !== currentFolderId) {
            selectFolder(videoFolder); // Tämä renderöi myös videolistan uudelleen
        }
    } else {
        // Ladataan uusi video. `onPlayerReady` hoitaa sen lisäämisen kirjastoon.
        loadVideoIntoPlayer(videoId);
    }
}

function loadVideoIntoPlayer(videoId) {
    playerPlaceholder.classList.add('hidden');
    if (player) {
        player.cueVideoById(videoId);
    } else {
        player = new YT.Player(playerDivId, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: { 'playsinline': 1, 'modestbranding': 1, 'rel': 0 },
            events: { 'onReady': onPlayerReadyInternal }
        });
    }
}
// Nimetään uudelleen, jotta ei sekoitu globaaliin onYouTubeIframeAPIReady
function onPlayerReadyInternal(event) {
    console.log("Player ready internal for video event");
    const videoData = player.getVideoData();
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
    } else {
        if (!videoEntry.title || videoEntry.title === "Nimetön Video") {
            videoEntry.title = videoTitle;
        }
        // Jos video ladataan uudelleen, varmista että sen folderId on oikein
        // (jos se oli jo kirjastossa ja käyttäjä vaihtoi kansiota ennen latausta)
        // Tämän pitäisi olla ok, koska handleLoadNewUrlVideo ja selectVideoFromLibrary hoitavat kansion valinnan.
    }
    
    library.settings.activeVideoId = currentVideoId;
    saveLibraryToLocal();
    renderVideoLibraryList(); // Varmista, että lista päivittyy oikein
    updateUIBasedOnState(); // Kattaa kommenttikentät, otsikot jne.
}

function selectVideoFromLibrary(videoIdToSelect) {
    const videoData = library.videos[videoIdToSelect];
    if (!videoData) return;

    currentVideoId = videoIdToSelect;
    library.settings.activeVideoId = currentVideoId;

    const targetFolderId = videoData.folderId || 'root';
    if (targetFolderId !== currentFolderId) {
        selectFolder(targetFolderId); // Tämä renderöi myös videolistan
    } else {
        // Jos kansio on sama, päivitä vain videolistan korostus ja UI
        updateActiveVideoInLibraryList(currentVideoId);
    }
    
    loadVideoIntoPlayer(videoIdToSelect);
    saveLibraryToLocal();
    updateUIBasedOnState(); // Tämä hoitaa kommentit, otsikot jne.
}

function handleVideoLibraryClick(event) {
    const target = event.target;
    const videoLi = target.closest('li[data-video-id]');

    if (target.classList.contains('delete-video-btn')) {
        event.stopPropagation();
        const videoId = target.closest('li[data-video-id]').dataset.videoId;
        if (videoId) handleRemoveVideo(videoId);
    } else if (target.tagName === 'SELECT' && target.closest('.video-actions')) {
        // Estä videon valinta, kun klikataan select-elementtiä
        event.stopPropagation();
    } else if (videoLi) {
        const videoId = videoLi.dataset.videoId;
        if (videoId && videoId !== currentVideoId) {
            selectVideoFromLibrary(videoId);
        } else if (videoId === currentVideoId && player && typeof player.playVideo === 'function') {
            // Jos sama video klikataan uudelleen, voisi esim. toistaa/pausettaa
            // player.playVideo(); // Tai jokin muu toiminto
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
            if (player) {
                try {
                    player.stopVideo(); // Pysäytä video ennen tuhoamista
                    player.destroy();
                } catch (e) { console.error("Error destroying player:", e); }
                player = null;
                document.getElementById(playerDivId).innerHTML = '';
            }
        }
        saveLibraryToLocal();
        renderVideoLibraryList();
        updateUIBasedOnState();
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
            selectMove.dataset.videoId = videoData.id;
            selectMove.addEventListener('change', handleMoveVideo);

            const defaultOpt = document.createElement('option');
            defaultOpt.textContent = "Siirrä...";
            defaultOpt.value = "";
            defaultOpt.disabled = true;
            defaultOpt.selected = true;
            selectMove.appendChild(defaultOpt);

            if (videoData.folderId !== null) {
                const rootOpt = document.createElement('option');
                rootOpt.value = 'root';
                rootOpt.textContent = 'Pääkansioon';
                selectMove.appendChild(rootOpt);
            }
            
            library.folders.forEach(folder => {
                if (folder.id !== videoData.folderId) {
                    const opt = document.createElement('option');
                    opt.value = folder.id;
                    opt.textContent = folder.name;
                    selectMove.appendChild(opt);
                }
            });
            // Näytä select vain jos on siirtovaihtoehtoja
            if (selectMove.options.length > 1) {
                 actionsContainer.appendChild(selectMove);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-video-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = `Poista video "${videoData.title}"`;
            // deleteBtn.dataset.videoId = videoData.id; // Ei tarvita, koska parentilla on jo
            actionsContainer.appendChild(deleteBtn);
            
            li.appendChild(actionsContainer);
            videoLibraryListUL.appendChild(li);
        });
    }
    updateActiveVideoInLibraryList(library.settings.activeVideoId);
    updateVideoListHeader();
}

function handleMoveVideo(event) {
    const videoId = event.target.dataset.videoId;
    const newFolderId = event.target.value;

    if (!videoId || newFolderId === "") return; // Älä tee mitään jos "Siirrä..." on valittu

    const video = library.videos[videoId];
    if (!video) return;

    const oldFolderId = video.folderId || 'root';
    video.folderId = (newFolderId === 'root' ? null : newFolderId);
    
    saveLibraryToLocal();
    
    // Jos video siirrettiin pois nykyisestä aktiivisesta kansiosta,
    // tai nykyiseen aktiiviseen kansioon, päivitä vain videolista.
    // Ei tarvitse vaihtaa kansiota, ellei käyttäjä tee sitä erikseen.
    if (oldFolderId === currentFolderId || (newFolderId === 'root' && currentFolderId === 'root') || newFolderId === currentFolderId) {
        renderVideoLibraryList();
    } else {
        // Jos video siirrettiin pois nykyisestä kansiosta, se vain katoaa listalta.
        // Tämä on ok, koska renderVideoLibraryList suodattaa currentFolderId:n mukaan.
        renderVideoLibraryList();
    }
    // Palauta selectin valinta "Siirrä..." tilaan
    event.target.value = "";
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
    if (currentVideoId && library.videos[currentVideoId] && player && typeof player.getPlayerState === 'function') {
        commentTextInput.disabled = false;
        addCommentBtn.disabled = false;
        updateCommentsHeader(library.videos[currentVideoId].title);
        renderCommentsList(); // Varmista että kommentit päivittyvät
        playerPlaceholder.classList.add('hidden');
    } else {
        commentTextInput.disabled = true;
        addCommentBtn.disabled = true;
        updateCommentsHeader();
        commentsListUL.innerHTML = '<li style="font-style: italic; color: var(--text-secondary);">Valitse video näyttääksesi kommentit.</li>';
        // Näytä placeholder vain jos soitinta ei ole tai se ei ole aktiivinen
        if (!player || !player.getPlayerState || [YT.PlayerState.UNSTARTED, YT.PlayerState.ENDED, -1].includes(player.getPlayerState())) {
            playerPlaceholder.classList.remove('hidden');
        }
    }
    updateVideoListHeader();
    updateActiveVideoInLibraryList(library.settings.activeVideoId);
    renderFolderList(); // Varmista, että kansiolista on myös ajantasalla korostusten osalta
}

// --- LOCALSTORAGE ---
function saveLibraryToLocal() {
    try {
        if (library.settings.activeVideoId && !library.videos[library.settings.activeVideoId]) {
            library.settings.activeVideoId = null;
        }
        if (library.settings.lastOpenedFolderId && library.settings.lastOpenedFolderId !== 'root' && !library.folders.find(f => f.id === library.settings.lastOpenedFolderId)) {
            library.settings.lastOpenedFolderId = 'root'; // Jos kansio poistettu
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(library));
    } catch (e) {
        console.error("Error saving to localStorage:", e);
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
            library = { // Yhdistä oletusarvoihin varmistaaksesi kaikkien avainten olemassaolon
                folders: parsed.folders || [],
                videos: parsed.videos || {},
                settings: {
                    lastOpenedFolderId: parsed.settings?.lastOpenedFolderId || 'root',
                    activeVideoId: parsed.settings?.activeVideoId || null
                }
            };
            // Varmista, että settings.activeVideoId on validi
            if (library.settings.activeVideoId && !library.videos[library.settings.activeVideoId]) {
                library.settings.activeVideoId = null;
            }
            // Varmista, että settings.lastOpenedFolderId on validi
            if (library.settings.lastOpenedFolderId !== 'root' && !library.folders.find(f => f.id === library.settings.lastOpenedFolderId)) {
                library.settings.lastOpenedFolderId = 'root';
            }

        } else {
            library = defaultLibrary;
        }
    } catch (e) {
        console.error("Error loading from localStorage:", e);
        library = defaultLibrary;
    }
    currentFolderId = library.settings.lastOpenedFolderId || 'root'; // Varmista asetus
}
