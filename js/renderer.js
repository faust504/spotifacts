
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function fmtD(h, m) {
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function nfR(label, value, bold = false, indent = false) {
    const cls = ['nf-row'];
    if (bold) cls.push('nf-row-bold');
    if (indent) cls.push('nf-row-indent');
    return `<div class="${cls.join(' ')}"><span class="nf-label-text">${esc(label)}</span><span class="nf-value-text">${esc(String(value))}</span></div>`;
}

function buildFunFacts(d) {
    const facts = [];
    const top = d.topArtists[0];
    const tt = d.topTracks[0];

    if (top) {
        const km = Math.round((top.ms / 1000) * 343 / 1000);
        facts.push(`You listened to <strong>${esc(top.name)}</strong> for <strong>${fmtD(top.hrs, top.min)}</strong>. At the speed of sound, that's <strong>${km.toLocaleString()} km</strong> of travel!`);
        if (km > 384400) facts.push(`That's enough <strong>${esc(top.name)}</strong> to reach the Moon.`);
        else if (km > 40075) facts.push(`You've circled the Earth with <strong>${esc(top.name)}</strong>!`);
        const marathons = Math.floor(km / 42.195);
        if (marathons > 1) facts.push(`Your <strong>${esc(top.name)}</strong> listening could soundtrack <strong>${marathons.toLocaleString()} marathons</strong>!`);
    }

    if (tt) {
        facts.push(`"<strong>${esc(tt.track)}</strong>" was played <strong>${tt.plays} times</strong>. That's <strong>${fmtD(tt.hrs, tt.min)}</strong> of pure commitment.`);
        if (d.earliest && d.latest) {
            const d1 = new Date(d.earliest), d2 = new Date(d.latest);
            const daySpan = Math.max(1, Math.ceil((d2 - d1) / 86400000));
            const perDay = (tt.plays / daySpan).toFixed(1);
            if (parseFloat(perDay) >= 1) facts.push(`You averaged <strong>${perDay}x per day</strong> on "${esc(tt.track)}". An anthem.`);
        }
    }

    const totalHours = d.totalMinRaw / 60;
    const movies = Math.floor(totalHours / 2);
    if (movies > 10) facts.push(`Your listening time equals to <strong>${movies.toLocaleString()} movies</strong>! (at 2 hours each).`);
    const books = Math.floor(totalHours / 7);
    if (books > 2) facts.push(`You could have finished <strong>${books} audiobooks</strong>! (at 7 hours each).`);
    const flights = Math.floor(totalHours / 12);
    if (flights > 1) facts.push(`That's <strong>${flights} flights</strong> from New York to Tokyo!`);

    // Sleep equivalent
    const sleeps = Math.floor(totalHours / 8);
    if (sleeps > 5) facts.push(`You could have slept for <strong>${sleeps} full nights</strong> in the time you spent listening!`);

    // Spotify minutes per day
    if (d.earliest && d.latest) {
        const d1 = new Date(d.earliest), d2 = new Date(d.latest);
        const daySpan = Math.max(1, Math.ceil((d2 - d1) / 86400000));
        const minPerDay = Math.round(d.totalMinRaw / daySpan);
        facts.push(`You averaged <strong>${minPerDay} minutes per day</strong> of music. That's ${minPerDay > 60 ? 'over an hour daily! Serious dedication!' : minPerDay > 30 ? 'a solid listening habit!' : 'a chill listening pace.'}`);
    }

    // Night owl or early bird
    if (d.wrapped.night != null) {
        if (d.wrapped.night > 50) facts.push(`You're a certified Night Owl — <strong>${d.wrapped.night.toFixed(0)}%</strong> of your listening happens after dark.`);
        else if (d.wrapped.night < 20) facts.push(`You're an Early Bird — only <strong>${d.wrapped.night.toFixed(0)}%</strong> of your listening is at night.`);
    }
    if (d.wrapped.skip != null) {
        if (d.wrapped.skip > 40) facts.push(`You skipped <strong>${d.wrapped.skip.toFixed(0)}%</strong> of tracks. Picky listener alert.`);
        else if (d.wrapped.skip < 15) facts.push(`Only <strong>${d.wrapped.skip.toFixed(0)}%</strong> skip rate. You commit to every song.`);
    }
    if (d.uniqueArtists > 500) facts.push(`<strong>${d.uniqueArtists.toLocaleString()}</strong> unique artists — your taste spans a whole continent.`);
    else if (d.uniqueArtists > 100) facts.push(`<strong>${d.uniqueArtists.toLocaleString()}</strong> unique artists streamed. Explorer energy.`);

    // Return ONE random fact (as per previous requirements)
    if (facts.length === 0) return "You have impeccable taste (and data)!";
    return facts[Math.floor(Math.random() * facts.length)];
}

function renderLabel(d, sections, activeRange) {
    const inner = document.getElementById('nfInner');
    const fH = h => h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM';
    const fDate = ds => {
        if (!ds) return '';
        const p = ds.split('-');
        const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${mo[parseInt(p[1], 10) - 1]} ${parseInt(p[2], 10)}, ${p[0]}`;
    };
    const fD = (h, m) => h > 0 ? `${h}h ${m}m` : `${m}m`; // Local fD used in renderLabel logic

    let pfpHtml = '<div class="nf-pfp-placeholder">?</div>', nameHtml = 'Listener', subHtml = '';
    if (d.identity) {
        if (d.identity.largeImageUrl || d.identity.imageUrl) pfpHtml = `<img class="nf-pfp" src="${esc(d.identity.largeImageUrl || d.identity.imageUrl)}" alt="pfp" crossorigin="anonymous" onerror="this.outerHTML='<div class=nf-pfp-placeholder>?</div>'">`;
        if (d.identity.displayName) nameHtml = esc(d.identity.displayName);
    }
    if (d.earliest && d.latest) subHtml = `${fDate(d.earliest)} – ${fDate(d.latest)}`;

    let timeRangeLabel = '';
    if (activeRange !== 'all') {
        const labels = { year: 'Last Year', '6mo': 'Last 6 Months', '3mo': 'Last 3 Months', month: 'Last Month', week: 'Last Week' };
        timeRangeLabel = labels[activeRange] || '';
    }

    let html = '';

    // HEADER (always)
    html += `
<div class="nf-profile">${pfpHtml}<div class="nf-profile-info"><div class="nf-profile-name">${nameHtml}</div><div class="nf-profile-sub">${subHtml}</div></div></div>
<div class="nf-title-row"><div class="nf-title">Nutrition Facts</div><span class="nf-badge">for <strong>Spotify</strong></span></div>
${timeRangeLabel ? `<div class="nf-subtitle">${esc(timeRangeLabel)}</div>` : ''}
<span class="nf-bar-thick"></span>
<div class="nf-serving">Serving Size <span class="nf-serving-detail">${d.totalStreams.toLocaleString()} streams${d.totalDays !== '0.0' ? ' over ' + d.totalDays + ' days' : ''}</span></div>
<span class="nf-bar-medium"></span>
<div class="nf-amount-header">Amount Per Serving</div>
<div class="nf-big-row"><span class="nf-big-label">Listening Time</span><span class="nf-big-value">${d.totalHrs.toLocaleString()}h ${d.totalMin}m</span><span class="nf-big-right">${d.totalDays} days equiv.</span></div>
<span class="nf-bar-medium"></span>`;

    // OVERVIEW
    if (sections.has('overview')) {
        html += `<div class="nf-dv-header">% of Your Life*</div>`;
        html += nfR('Total Streams', d.totalStreams.toLocaleString(), true);
        html += nfR('Unique Artists', d.uniqueArtists.toLocaleString(), false, true);
        html += nfR('Unique Tracks', d.uniqueTracks.toLocaleString(), false, true);
        html += nfR('Peak Hour', fH(d.peakIdx), true);
        html += nfR('Avg. Track Length', `${Math.floor(d.avgTrackSec / 60)}m ${d.avgTrackSec % 60}s`, false, true);
        html += nfR('Most Active Day', d.topDow, false, true);
    }

    // ARTISTS
    if (sections.has('artists')) {
        html += `<span class="nf-bar-thick"></span><div class="nf-section-head">Top 10 Artists</div>`;
        html += '<ul class="nf-rank-list">' + d.topArtists.map((a, i) => `
    <li class="nf-rank-item">
        <span class="nf-rank-num">${i + 1}</span>
        <span class="nf-rank-info"><span class="nf-rank-name">${esc(a.name)}</span></span>
        <span class="nf-rank-stat">${fD(a.hrs, a.min)}</span>
    </li>`).join('') + '</ul>';
    }

    // TRACKS
    if (sections.has('tracks')) {
        html += `<span class="nf-bar-medium"></span><div class="nf-section-head">Top 10 Tracks</div>`;
        html += '<ul class="nf-rank-list">' + d.topTracks.map((t, i) => `
    <li class="nf-rank-item">
        <span class="nf-rank-num">${i + 1}</span>
        <span class="nf-rank-info">
            <span class="nf-rank-name">${esc(t.track)}</span>
            <span class="nf-rank-sub">${esc(t.artist)}</span>
        </span>
        <span class="nf-rank-stat">${t.plays} plays<span class="nf-rank-stat-sub">${fD(t.hrs, t.min)}</span></span>
    </li>`).join('') + '</ul>';
    }

    // HOURS
    if (sections.has('hours')) {
        html += `<span class="nf-bar-medium"></span><div class="nf-section-head">Listening Hours</div>`;
        html += '<div class="nf-hours-chart">';
        for (let i = 0; i < 24; i++) {
            const pct = Math.max(d.hourNorm[i] * 100, 2);
            html += `<div class="nf-hour-bar"><div class="nf-hour-fill" style="height:${pct}%"></div></div>`;
        }
        html += '</div><div class="nf-hours-labels"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>';
    }

    // GENRES
    if (sections.has('genres') && d.topGenres.length > 0) {
        html += `<span class="nf-bar-thin"></span><div class="nf-section-head">Top Genres</div>`;
        html += '<div class="nf-genre-row">' + d.topGenres.map(g => {
            const hrs = Math.floor(g.seconds / 3600), mins = Math.floor((g.seconds % 3600) / 60);
            return `<span class="nf-genre-pill">${esc(g.name)} · ${hrs > 0 ? hrs + 'h ' : ''}${mins}m</span>`;
        }).join('') + '</div>';
    }

    // WRAPPED
    if (sections.has('wrapped') && Object.keys(d.wrapped).length > 0) {
        const w = d.wrapped;
        html += `<span class="nf-bar-medium"></span>`;
        html += `<div class="nf-wrapped-card"><div class="nf-wrapped-title">Wrapped Highlights</div>`;
        if (w.minutes) html += nfR('Wrapped Minutes', w.minutes.toLocaleString(), true);
        if (w.days) html += nfR('Active Days', w.days, false, true);
        if (w.streak) html += nfR('Longest Streak', w.streak + ' days', false, true);
        if (w.discovered) html += nfR('New Artists Discovered', w.discovered.toLocaleString() + ' artists', false, true);
        if (w.numArtists) html += nfR('Unique Artists (yr)', w.numArtists.toLocaleString(), false, true);
        if (w.numTracks) html += nfR('Unique Tracks (yr)', w.numTracks.toLocaleString(), false, true);
        if (w.completedAlbums) html += nfR('Albums Completed', w.completedAlbums, false, true);
        if (w.totalGenres) html += nfR('Genres Explored', w.totalGenres, false, true);
        if (w.skip != null) html += nfR('Skip Rate', w.skip.toFixed(1) + '%', true);
        if (w.night != null) html += nfR('Night Listening', w.night.toFixed(1) + '%', false, true);
        if (w.explicit != null) html += nfR('Explicit Content', w.explicit.toFixed(1) + '%', false, true);
        if (w.party_pct != null) html += nfR('Happiness', w.party_pct.toFixed(1) + '%', false, true);
        if (w.sad != null) html += nfR('Sadness', w.sad.toFixed(1) + '%', false, true);
        if (w.love != null) html += nfR('Love', w.love.toFixed(1) + '%', false, true);
        if (w.chill != null) html += nfR('Chill', w.chill.toFixed(1) + '%', false, true);
        if (w.listeningAge != null) {
            const phase = w.decadePhase ? w.decadePhase + ' ' : '';
            const era = w.windowStartYear ? `${phase}${w.windowStartYear}s` : `era #${w.listeningAge}`;
            html += nfR('Listening Era', `The ${era}`, false, true);
        }
        if (w.club) { const cn = w.club.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); html += nfR('Club', cn, false, true) }
        html += `</div>`;
    }

    // VITAMINS
    if (sections.has('vitamins')) {
        html += `<span class="nf-bar-thick"></span>`;
        const vits = [];
        vits.push({ l: 'Playlists', v: d.playlistCount }, { l: 'Playlist Tracks', v: d.playlistTracks });
        vits.push({ l: 'Liked Songs', v: d.libTracks }, { l: 'Following', v: d.following });
        vits.push({ l: 'Followers', v: d.followers }, { l: 'Super Listener', v: d.superListeners });
        if (d.wrapped.streak) vits.push({ l: 'Longest Streak', v: d.wrapped.streak + 'd' });
        if (d.wrapped.discovered) vits.push({ l: 'Discovered', v: d.wrapped.discovered.toLocaleString() + ' artists' });
        if (vits.length % 2 !== 0) vits.push({ l: '', v: '' });
        html += '<div class="nf-vitamin-grid">' + vits.map(v => `<div class="nf-vitamin-cell"><span class="nf-vitamin-label">${esc(String(v.l))}</span><span class="nf-vitamin-value">${esc(String(v.v))}</span></div>`).join('') + '</div>';
    }

    // FUN FACTS
    if (sections.has('funfacts')) html += `<div class="nf-funfact">${buildFunFacts(d)}</div>`;

    // FOOTER
    html += `<div class="nf-footer"><strong>*</strong> Percent Daily Values are based on a 24-hour day. Your actual listening may be higher or lower depending on your vibe needs. Not a real nutrition label.</div>`;
    inner.innerHTML = html;
}
