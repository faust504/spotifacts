
async function processZip(file, collectedFiles) {
    var zip = await JSZip.loadAsync(file);
    var entries = Object.entries(zip.files);
    for (var i = 0; i < entries.length; i++) {
        var path = entries[i][0];
        var entry = entries[i][1];
        if (entry.dir) continue;
        var name = path.split('/').pop();
        if (name.endsWith('.json')) collectedFiles.set(name, await entry.async('string'));
    }
}

function readText(f) {
    return new Promise(function (r, j) {
        var x = new FileReader();
        x.onload = function () { r(x.result); };
        x.onerror = function () { j(); };
        x.readAsText(f);
    });
}

/**
 * Normalizes an extended streaming history entry into the standard format.
 * Extended format uses: ts, ms_played, master_metadata_track_name, master_metadata_album_artist_name, skipped
 * Standard format uses: endTime, msPlayed, trackName, artistName
 */
function normalizeExtendedEntry(e) {
    // Skip entries with no track name (podcasts, audiobooks, etc.)
    if (!e.master_metadata_track_name) return null;
    // Convert ISO ts "2024-12-12T10:02:52Z" to endTime format "2024-12-12 10:02"
    var endTime = '';
    if (e.ts) {
        endTime = e.ts.replace('T', ' ').replace('Z', '');
        // Trim seconds if present: "2024-12-12 10:02:52" -> "2024-12-12 10:02"
        var parts = endTime.split(':');
        if (parts.length >= 2) endTime = parts[0] + ':' + parts[1];
    }
    return {
        endTime: endTime,
        msPlayed: e.ms_played || 0,
        trackName: e.master_metadata_track_name || 'Unknown',
        artistName: e.master_metadata_album_artist_name || 'Unknown',
        // Preserve extra extended fields
        albumName: e.master_metadata_album_album_name || '',
        skipped: e.skipped || false,
        platform: e.platform || '',
        shuffle: e.shuffle || false,
        offline: e.offline || false,
        incognito: e.incognito_mode || false,
        reasonStart: e.reason_start || '',
        reasonEnd: e.reason_end || ''
    };
}

function parseRawData(collectedFiles) {
    var parsedRawHistory = [];
    var isExtended = false;

    // Check for extended streaming history files first (Streaming_History_Audio_*.json)
    for (var entry of collectedFiles) {
        var name = entry[0];
        var text = entry[1];
        if (name.startsWith('Streaming_History_Audio_')) {
            try {
                var parsed = JSON.parse(text);
                for (var i = 0; i < parsed.length; i++) {
                    var normalized = normalizeExtendedEntry(parsed[i]);
                    if (normalized) parsedRawHistory.push(normalized);
                }
                isExtended = true;
            } catch (err) { /* skip unparseable files */ }
        }
    }

    // If no extended history found, fall back to standard format (StreamingHistory_music_*.json)
    if (!isExtended) {
        for (var entry2 of collectedFiles) {
            var name2 = entry2[0];
            var text2 = entry2[1];
            if (name2.startsWith('StreamingHistory_music_')) {
                try {
                    parsedRawHistory = parsedRawHistory.concat(JSON.parse(text2));
                } catch (err2) { /* skip unparseable files */ }
            }
        }
    }

    if (!parsedRawHistory.length) throw new Error('No streaming history found.');

    // Helper to safely parse JSON from collectedFiles
    var tp = function (n) {
        var r = collectedFiles.get(n);
        if (!r) return null;
        try { return JSON.parse(r); } catch (err) { return null; }
    };

    var parsedExtras = {
        identity: tp('Identity.json'),
        follow: tp('Follow.json'),
        playlists: tp('Playlist1.json'),
        marquee: (function () { for (var e of collectedFiles) { if (e[0] === 'Marquee.json') { try { return JSON.parse(e[1]); } catch (err) { } } } return null; })(),
        wrapped: (function () { for (var e of collectedFiles) { if (e[0].startsWith('Wrapped')) { try { return JSON.parse(e[1]); } catch (err) { } } } return null; })(),
        library: tp('YourLibrary.json'),
        capsule: tp('YourSoundCapsule.json'),
    };

    return { parsedRawHistory: parsedRawHistory, parsedExtras: parsedExtras, isExtended: isExtended };
}


function filterByRange(history, range) {
    if (range === 'all') return history;
    var now = new Date();
    var c = {
        year: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
        '6mo': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
        '3mo': new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
        month: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
        week: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
    };
    var cutoff = c[range];
    if (!cutoff) return history;
    return history.filter(function (e) {
        if (!e.endTime) return false;
        // Handle both formats: "2025-02-07 16:07" and "2024-12-12 10:02"
        var dateStr = e.endTime.trim();
        // Normalize: replace space with T, add Z for UTC
        var d = new Date(dateStr.replace(' ', 'T') + 'Z');
        return d >= cutoff;
    });
}

function processData(history, ext) {
    var totalMs = 0;
    for (var i = 0; i < history.length; i++) totalMs += (history[i].msPlayed || 0);
    var totalMin = Math.floor(totalMs / 60000);
    var totalHrs = Math.floor(totalMin / 60);
    var remMin = totalMin % 60;
    var totalDays = (totalMin / 1440).toFixed(1);
    var artistMap = new Map();
    var trackMap = new Map();
    var hourMap = new Array(24).fill(0);
    var earliest = null;
    var latest = null;

    // Track skip and shuffle stats from extended data
    var totalSkipped = 0;
    var totalShuffled = 0;
    var hasExtendedData = false;

    for (var idx = 0; idx < history.length; idx++) {
        var e = history[idx];
        var ms = e.msPlayed || 0;
        var artist = e.artistName || 'Unknown';
        var track = e.trackName || 'Unknown';
        var key = artist + '|||' + track;
        artistMap.set(artist, (artistMap.get(artist) || 0) + ms);
        if (!trackMap.has(key)) trackMap.set(key, { artist: artist, track: track, ms: 0, plays: 0 });
        var t = trackMap.get(key);
        t.ms += ms;
        t.plays++;

        // Extended data tracking
        if (e.skipped !== undefined) {
            hasExtendedData = true;
            if (e.skipped) totalSkipped++;
            if (e.shuffle) totalShuffled++;
        }

        if (e.endTime) {
            var dateStr = e.endTime.trim();
            // Extract hour from "2025-02-07 16:07" or "2024-12-12 10:02"
            var timePart = dateStr.split(' ')[1];
            if (timePart) {
                var hr = parseInt(timePart.split(':')[0], 10);
                if (!isNaN(hr)) hourMap[hr] += ms;
            }
            var datePart = dateStr.split(' ')[0];
            if (!earliest || datePart < earliest) earliest = datePart;
            if (!latest || datePart > latest) latest = datePart;
        }
    }

    var topArtists = [];
    var artistEntries = [];
    artistMap.forEach(function (ms, name) { artistEntries.push([name, ms]); });
    artistEntries.sort(function (a, b) { return b[1] - a[1]; });
    for (var ai = 0; ai < Math.min(artistEntries.length, 10); ai++) {
        var aName = artistEntries[ai][0];
        var aMs = artistEntries[ai][1];
        topArtists.push({ name: aName, hrs: Math.floor(aMs / 3600000), min: Math.floor((aMs % 3600000) / 60000), ms: aMs });
    }

    var trackValues = [];
    trackMap.forEach(function (v) { trackValues.push(v); });
    trackValues.sort(function (a, b) { return b.ms - a.ms; });
    var topTracks = [];
    for (var ti = 0; ti < Math.min(trackValues.length, 10); ti++) {
        var tv = trackValues[ti];
        topTracks.push({ artist: tv.artist, track: tv.track, ms: tv.ms, plays: tv.plays, hrs: Math.floor(tv.ms / 3600000), min: Math.floor((tv.ms % 3600000) / 60000) });
    }

    var maxHour = Math.max.apply(null, hourMap);
    var hourNorm = hourMap.map(function (v) { return maxHour > 0 ? v / maxHour : 0; });
    var peakIdx = hourMap.indexOf(maxHour);

    var topGenres = [];
    if (ext.capsule && ext.capsule.stats) {
        var gm = new Map();
        ext.capsule.stats.forEach(function (s) {
            if (s.topGenres) s.topGenres.forEach(function (g) {
                gm.set(g.name, (gm.get(g.name) || 0) + (g.secondsPlayed || 0));
            });
        });
        var genreEntries = [];
        gm.forEach(function (s, n) { genreEntries.push([n, s]); });
        genreEntries.sort(function (a, b) { return b[1] - a[1]; });
        for (var gi = 0; gi < Math.min(genreEntries.length, 10); gi++) {
            topGenres.push({ name: genreEntries[gi][0], seconds: genreEntries[gi][1] });
        }
    }

    var playlistCount = 0, playlistTracks = 0;
    if (ext.playlists && ext.playlists.playlists) {
        playlistCount = ext.playlists.playlists.length;
        ext.playlists.playlists.forEach(function (p) { playlistTracks += (p.items || []).length; });
    }
    var libTracks = 0;
    if (ext.library && ext.library.tracks) libTracks = ext.library.tracks.length;
    var superListeners = 0;
    if (ext.marquee && Array.isArray(ext.marquee)) {
        superListeners = ext.marquee.filter(function (m) { return m.segment === 'Super Listeners'; }).length;
    }
    var following = 0, followers = 0;
    if (ext.follow) {
        following = (ext.follow.userIsFollowing || []).length;
        followers = (ext.follow.userIsFollowedBy || []).length;
    }

    var w = {};
    if (ext.wrapped) {
        var wr = ext.wrapped;
        if (wr.yearlyMetrics) w.minutes = Math.floor(wr.yearlyMetrics.totalMsListened / 60000);
        if (wr.clubs) w.club = wr.clubs.userClub;
        if (wr.topArtists) w.numArtists = wr.topArtists.numUniqueArtists;
        if (wr.topTracks) w.numTracks = wr.topTracks.numUniqueTracks;
        if (wr.party) {
            w.days = wr.party.totalNumListeningDays;
            w.streak = wr.party.streakNumListeningDays;
            w.discovered = wr.party.numArtistsDiscovered;
            w.skip = wr.party.percentMusicSkips;
            w.night = wr.party.percentListenedNight;
            w.explicit = wr.party.percentListenedExplicit;
            w.sad = wr.party.percentSadTracks;
            w.party_pct = wr.party.percentPartyTracks;
            w.love = wr.party.percentLoveTracks;
            w.chill = wr.party.percentChillTracks;
        }
        if (wr.topAlbums) w.completedAlbums = wr.topAlbums.numCompletedAlbums;
        if (wr.topGenres) w.totalGenres = wr.topGenres.totalNumGenres;
        if (wr.listeningAge) {
            w.listeningAge = wr.listeningAge.listeningAge;
            w.windowStartYear = wr.listeningAge.windowStartYear;
            w.decadePhase = wr.listeningAge.decadePhase;
        }
    }

    // If extended data provides skip rate and wrapped doesn't, use it
    if (hasExtendedData && w.skip == null && history.length > 0) {
        w.skip = (totalSkipped / history.length) * 100;
    }

    var avgTrackSec = history.length > 0 ? Math.round(totalMs / (history.length * 1000)) : 0;
    var dowMap = [0, 0, 0, 0, 0, 0, 0];
    history.forEach(function (e) {
        if (e.endTime) {
            var d = new Date(e.endTime.replace(' ', 'T') + 'Z');
            dowMap[d.getUTCDay()] += (e.msPlayed || 0);
        }
    });
    var dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var topDow = dowNames[dowMap.indexOf(Math.max.apply(null, dowMap))];

    return {
        totalStreams: history.length, totalMs: totalMs, totalHrs: totalHrs, totalMin: remMin, totalMinRaw: totalMin, totalDays: totalDays,
        uniqueArtists: artistMap.size, uniqueTracks: trackMap.size, topArtists: topArtists, topTracks: topTracks, hourNorm: hourNorm, peakIdx: peakIdx, topGenres: topGenres,
        earliest: earliest, latest: latest, identity: ext.identity, following: following, followers: followers, playlistCount: playlistCount, playlistTracks: playlistTracks,
        libTracks: libTracks, superListeners: superListeners, wrapped: w, avgTrackSec: avgTrackSec, topDow: topDow,
        // Extended data extras
        totalSkipped: totalSkipped, totalShuffled: totalShuffled, hasExtendedData: hasExtendedData
    };
}
