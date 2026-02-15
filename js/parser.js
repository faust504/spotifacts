
async function processZip(file, collectedFiles) {
    const zip = await JSZip.loadAsync(file);
    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const name = path.split('/').pop();
        if (name.endsWith('.json')) collectedFiles.set(name, await entry.async('string'));
    }
}

function readText(f) {
    return new Promise((r, j) => {
        const x = new FileReader();
        x.onload = () => r(x.result);
        x.onerror = () => j();
        x.readAsText(f);
    });
}

function parseRawData(collectedFiles) {
    let parsedRawHistory = [];
    for (const [name, text] of collectedFiles)
        if (name.startsWith('StreamingHistory_music_')) try { parsedRawHistory = parsedRawHistory.concat(JSON.parse(text)) } catch { }

    if (!parsedRawHistory.length) throw new Error('No streaming history found.');

    // Helper to safely parse JSON from collectedFiles
    const tp = n => { const r = collectedFiles.get(n); if (!r) return null; try { return JSON.parse(r) } catch { return null } };

    const parsedExtras = {
        identity: tp('Identity.json'),
        follow: tp('Follow.json'),
        playlists: tp('Playlist1.json'),
        marquee: (() => { for (const [n, t] of collectedFiles) if (n === 'Marquee.json') try { return JSON.parse(t) } catch { }; return null })(),
        wrapped: (() => { for (const [n, t] of collectedFiles) if (n.startsWith('Wrapped')) try { return JSON.parse(t) } catch { }; return null })(),
        library: tp('YourLibrary.json'),
        capsule: tp('YourSoundCapsule.json'),
    };

    return { parsedRawHistory, parsedExtras };
}


function filterByRange(history, range) {
    if (range === 'all') return history;
    const now = new Date('2026-02-15T14:38:00+07:00');
    const c = {
        year: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
        '6mo': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
        '3mo': new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
        month: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
        week: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    };
    const cutoff = c[range]; if (!cutoff) return history;
    return history.filter(e => { if (!e.endTime) return false; return new Date(e.endTime.replace(' ', 'T') + 'Z') >= cutoff });
}

function processData(history, ext) {
    const totalMs = history.reduce((s, e) => s + (e.msPlayed || 0), 0);
    const totalMin = Math.floor(totalMs / 60000), totalHrs = Math.floor(totalMin / 60), remMin = totalMin % 60;
    const totalDays = (totalMin / 1440).toFixed(1);
    const artistMap = new Map(), trackMap = new Map(), hourMap = new Array(24).fill(0);
    let earliest = null, latest = null;

    history.forEach(e => {
        const ms = e.msPlayed || 0, artist = e.artistName || 'Unknown', track = e.trackName || 'Unknown';
        const key = `${artist}|||${track}`;
        artistMap.set(artist, (artistMap.get(artist) || 0) + ms);
        if (!trackMap.has(key)) trackMap.set(key, { artist, track, ms: 0, plays: 0 });
        const t = trackMap.get(key); t.ms += ms; t.plays++;
        if (e.endTime) {
            const tp = e.endTime.split(' ')[1];
            if (tp) { const hr = parseInt(tp.split(':')[0], 10); if (!isNaN(hr)) hourMap[hr] += ms }
            const dp = e.endTime.split(' ')[0];
            if (!earliest || dp < earliest) earliest = dp;
            if (!latest || dp > latest) latest = dp;
        }
    });

    const topArtists = [...artistMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, ms]) => ({ name, hrs: Math.floor(ms / 3600000), min: Math.floor((ms % 3600000) / 60000), ms }));
    const topTracks = [...trackMap.values()].sort((a, b) => b.ms - a.ms).slice(0, 10)
        .map(t => ({ ...t, hrs: Math.floor(t.ms / 3600000), min: Math.floor((t.ms % 3600000) / 60000) }));
    const maxHour = Math.max(...hourMap);
    const hourNorm = hourMap.map(v => maxHour > 0 ? v / maxHour : 0);
    const peakIdx = hourMap.indexOf(maxHour);

    let topGenres = [];
    if (ext.capsule && ext.capsule.stats) {
        const gm = new Map();
        ext.capsule.stats.forEach(s => { if (s.topGenres) s.topGenres.forEach(g => gm.set(g.name, (gm.get(g.name) || 0) + (g.secondsPlayed || 0))) });
        topGenres = [...gm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, s]) => ({ name: n, seconds: s }));
    }

    let playlistCount = 0, playlistTracks = 0;
    if (ext.playlists && ext.playlists.playlists) { playlistCount = ext.playlists.playlists.length; ext.playlists.playlists.forEach(p => playlistTracks += (p.items || []).length) }
    let libTracks = 0; if (ext.library && ext.library.tracks) libTracks = ext.library.tracks.length;
    let superListeners = 0;
    if (ext.marquee && Array.isArray(ext.marquee)) superListeners = ext.marquee.filter(m => m.segment === 'Super Listeners').length;
    let following = 0, followers = 0;
    if (ext.follow) { following = (ext.follow.userIsFollowing || []).length; followers = (ext.follow.userIsFollowedBy || []).length }

    let w = {};
    if (ext.wrapped) {
        const wr = ext.wrapped;
        if (wr.yearlyMetrics) w.minutes = Math.floor(wr.yearlyMetrics.totalMsListened / 60000);
        if (wr.clubs) w.club = wr.clubs.userClub;
        if (wr.topArtists) w.numArtists = wr.topArtists.numUniqueArtists;
        if (wr.topTracks) w.numTracks = wr.topTracks.numUniqueTracks;
        if (wr.party) {
            w.days = wr.party.totalNumListeningDays; w.streak = wr.party.streakNumListeningDays;
            w.discovered = wr.party.numArtistsDiscovered; w.skip = wr.party.percentMusicSkips;
            w.night = wr.party.percentListenedNight; w.explicit = wr.party.percentListenedExplicit;
            w.sad = wr.party.percentSadTracks; w.party_pct = wr.party.percentPartyTracks;
            w.love = wr.party.percentLoveTracks; w.chill = wr.party.percentChillTracks;
        }
        if (wr.topAlbums) w.completedAlbums = wr.topAlbums.numCompletedAlbums;
        if (wr.topGenres) w.totalGenres = wr.topGenres.totalNumGenres;
        if (wr.listeningAge) {
            w.listeningAge = wr.listeningAge.listeningAge;
            w.windowStartYear = wr.listeningAge.windowStartYear;
            w.decadePhase = wr.listeningAge.decadePhase;
        }
    }

    const avgTrackSec = history.length > 0 ? Math.round(totalMs / (history.length * 1000)) : 0;
    const dowMap = [0, 0, 0, 0, 0, 0, 0];
    history.forEach(e => { if (e.endTime) { const d = new Date(e.endTime.replace(' ', 'T') + 'Z'); dowMap[d.getUTCDay()] += (e.msPlayed || 0) } });
    const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const topDow = dowNames[dowMap.indexOf(Math.max(...dowMap))];

    return {
        totalStreams: history.length, totalMs, totalHrs, totalMin: remMin, totalMinRaw: totalMin, totalDays,
        uniqueArtists: artistMap.size, uniqueTracks: trackMap.size, topArtists, topTracks, hourNorm, peakIdx, topGenres,
        earliest, latest, identity: ext.identity, following, followers, playlistCount, playlistTracks,
        libTracks, superListeners, wrapped: w, avgTrackSec, topDow
    };
}
