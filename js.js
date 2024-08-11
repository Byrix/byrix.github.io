const accessKey = "pk.eyJ1Ijoic2VhbmJyb29rZXIiLCJhIjoiY2x0b3ZzYjA5MGtvZzJqcGNrb3g1d3l4aSJ9.9p072aD5fFi4HG5YuWHI6A";
const zoom_extents = { '10': 17, '25': 16, '50': 15, '_1': 14 }
var modal, map, dark, train_stations, zoomed_in = false;

async function getData(source, sourceLayer) {
    return new Promise((resolve, reject) => {
        try {
            var features;
            if (!map.isSourceLoaded(source)) {
                console.log("Waiting for load");
                map.on('sourcedata', function checkData(e) {
                    if (e.sourceId==source && e.isSourceLoaded) {
                        console.log("Loaded");
                        setTimeout(()=>{
                            features = map.querySourceFeatures(source, { sourceLayer: sourceLayer });
                            map.off('sourcedata', checkData);
                            resolve(features)
                        }, 500);
                    }
                })
            } else {
                console.log("Else");
                features = map.querySourceFeatures(source, { sourceLayer: sourceLayer });
                resolve(features)
            }
        } catch(err) {
            reject(err);
        }
    });
}
function loadSymbols(name) {
    return new Promise((resolve, reject) => {
        map.loadImage(`https://raw.githubusercontent.com/Byrix/parknear/main/symbols/${name}.png`, (err, image) => {
            if (err) {
                reject(err);
            } else {
                map.addImage(`symbol-${name}`, image);
                resolve();
            }
        })
    });
}
async function loadData() {
    // Load all custom symbology used
    await Promise.all(['parking', 'parking-dark', 'train', 'parking-onstreet-dark', 'parking-onstreet'].map((name) => loadSymbols(name)))
        .then(() => console.log('All symbols loaded!'))
        .catch(err => console.warn("ERROR: " + err));

    // Add sources and layers
    map.addSource('parking-source', {
        'type': 'vector',
        'url': 'mapbox://seanbrooker.0eu87qns'
    }).addLayer({
        'id': 'parking',
        'type': 'symbol',
        'source': 'parking-source',
        'source-layer': 'parking-8wthl3',
        // 'maxzoom': 16,  // Only display when not zoomed in
        'layout': {
            // 'icon-image': dark ? 'symbol-parking' : 'symbol-parking-dark',
            'icon-image': ['case',
                ['==', 0, ['get', 'street']],
                dark ? 'symbol-parking' : 'symbol-parking-dark',
                dark ? 'symbol-parking-onstreet' : 'symbol-parking-onstreet-dark',
            ],
            'icon-size': 0.2,
            'symbol-sort-key': ['-', ['get', 'capacity']],  // Prioritise display of high capacity car parks
        }
    });
    // map.addSource('parking-poly-source', {
    //     'type': 'vector',
    //     'url': 'mapbox://seanbrooker.792feceu'
    // }).addLayer({
    //     'id': 'parking-poly',
    //     'type': 'fill',
    //     'source': 'parking-poly-source',
    //     'source-layer': 'parking-poly-merc-0fc86v',
    //     'minzoom': 16,  // Only display when zoomed in
    //     'paint': {
    //         'fill-color': dark ? '#3b4252' : '#e5e9f0',
    //         'fill-outline-color': dark ? '#e5e9f0' : '#3b4252'
    //     }
    // });
    map.addSource('station-source', {
        'type': 'vector',
        'url': 'mapbox://seanbrooker.5sd4zdao'
    }).addLayer({
        'id': 'stations',
        'type': 'symbol',
        'source': 'station-source',
        'source-layer': 'stations-5p00fr',
        'layout': {
            'icon-image': 'symbol-train',
            'icon-size': 0.3
        }
    });
}
async function refresh() {
    console.log("Refreshing");
    $('*').css('cursor', 'progress');
    // Get new filter values
    let dist = $('input[name="distance"]:checked').val();
    let station = $('#select_station').val();
    let street = $('input[name="street"]:checked').val();

    if (!dist || !station || !street) return;

    await Promise.all([
        (async () => {
            // Update filters
            // Define feature filters
            console.log("refresh() : updating filters");
            var filterTerms = ['all'];
            filterTerms.push(['in', station, ['get', `station_${dist}`]]);
            if(street !== undefined && street!=='3') { filterTerms.push(['==', parseInt(street), ['get', 'street']]) }

            // Update the filters
            map.setFilter('parking', filterTerms);
            // map.setFilter('parking-poly', filterTerms);
            console.log('refresh() : new filters set');
        })(),
        (async () => {
            // Update map view
            // Get all stations
            console.log('refresh() : getting map data');
            const stations = await getData('station-source', 'stations-5p00fr');
            let stationSub = station.substring(0, station.length-1);
            let stationLocation;
            stations.forEach(st => {
                let sterm = st.properties.sterm;
                if (sterm===stationSub) { stationLocation = new mapboxgl.LngLat(st.properties.LONGITUDE, st.properties.LATITUDE); }
            });
            if (stationLocation) { map.flyTo({center: stationLocation, zoom: zoom_extents[dist]}); }
            console.log('refresh() : updated map');
        })()
    ]);
    $('*').css('cursor', '');
    console.log('refresh() : refreshed')
    console.log("refresh() : check for results");

    const getRendered = async (layer) => {
        return new Promise((resolve, reject) => {
            try {
                if (!map.style || !map.isStyleLoaded()) {
                    map.once('idle', () => {
                        resolve(map.queryRenderedFeatures({ layers: [layer] }));
                    })
                } else {
                    resolve(map.queryRenderedFeatures({ layers: [layer] }));
                }
            } catch(err) {
                reject(err);
            }
        })
    };

    renderedFeatures = await getRendered('parking');
    if (renderedFeatures.length==0) {
        alert("No carparks found for the given specifications!");
    }
}
async function initMap() {
    // Load data into the map
    loadData().then(() => console.log("Data loaded!")).then( async () => {
        var $dropdown = $('#select_station')
        var stations = await getData('station-source', 'stations-5p00fr');
        train_stations = stations;
        stations.forEach(station => {
            $select = $(`<option value='${station.properties.sterm},'>${station.properties.name}</option>`);
            $dropdown.append($select);
        });
        $dropdown.val('');
    });

    // Add map controls
    map.addControl(new mapboxgl.NavigationControl())
        .addControl(new mapboxgl.FullscreenControl())
        .addControl(new mapboxgl.ScaleControl());

    // Customise map controls
    ['zoom-in', 'zoom-out', 'compass', 'fullscreen'].forEach(btnname => {
        const $btn = $(`.mapboxgl-ctrl button.mapboxgl-ctrl-${btnname} .mapboxgl-ctrl-icon`);
        $btn.addClass('material-symbols-outlined');
    });
    $(`.mapboxgl-ctrl button.mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon`).append('add');
    $(`.mapboxgl-ctrl button.mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon`).append('remove');
    $(`.mapboxgl-ctrl button.mapboxgl-ctrl-fullscreen .mapboxgl-ctrl-icon`).append('fullscreen');
    $(`.mapboxgl-ctrl button.mapboxgl-ctrl-compass .mapboxgl-ctrl-icon`).append('explore');

    // MOUSE EVENTS
    // Parking events
    const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
    });
    const mouseenterparking = (e) => {
        map.getCanvas().style.cursor = 'pointer';
        // console.log(e);
        let properties = e.features[0].properties;
        // console.log(properties);

        let street_text = properties.street===1 ? 'On-Street Parking' : 'Off-street Parking';
        let newHTML = `<b>${street_text}</b><br><b>Capacity: </b>${properties.capacity}<br><br>`
        newHTML += `<span class='text-import-low'>Click to get Google Maps navigation</span>`

        popup.setLngLat(e.lngLat).setHTML(newHTML).addTo(map);
    }
    map.on('mouseenter', 'parking', mouseenterparking);
    map.on('mouseleave', 'parking', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    map.on('click', 'parking', (e) => { window.open(`https://www.google.com/maps/dir//${e.lngLat.lat},${e.lngLat.lng}`, '_blank', 'noreferrer=true') });
    // map.on('mouseenter', 'parking-poly', mouseenterparking);
    // map.on('mouseleave', 'parking-poly', () => {
    //     map.getCanvas().style.cursor = '';
    //     popup.remove();
    // });
    // map.on('click', 'parking-poly', (e) => { window.open(`https://www.google.com/maps/dir//${e.lngLat.lat},${e.lngLat.lng}`, '_blank', 'noreferrer=true') });
    // Station events
    var latestStation = '';
    map.on('mouseenter', 'stations', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        let prop = e.features[0].properties;

        latestStation = prop.sterm;
        popup.setLngLat(e.lngLat).setHTML(`<b>${prop.name}</b>`).addTo(map);
    });
    map.on('mouseleave', 'stations', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    map.on('click', 'stations', (e) => {
        popup.remove();
        let dist = $('input[name="distance"]:checked').val();
        $('#select_station').val(`${latestStation},`);
        map.flyTo({ center: e.lngLat, zoom: zoom_extents[dist] });
        refresh();
    });


    // map.on('render', () => {
    //     if ((!zoomed_in && map.getZoom() > 16) || zoomed_in && map.getZoom() < 16) {
    //         zoomed_in = !zoomed_in;
    //         $('.parking-poly').toggleClass('hide');
    //         $('.parking-point').toggleClass('hide');
    //     }
    // });
}
function modalSubmit() {
    $('*').css('cursor', 'progress');

    // Get new vars from input
    let dist = $('input[name="mdl-distance"]:checked').val();
    let station = $('#mdl_select_station').val();
    let street = $('input[name="mdl-street"]:checked').val();

    console.log(station);

    // Update sidebar to match
    $(`input[name="distance"][value='${dist}']`).prop('checked', true);
    $('#select_station').val(station);
    $(`input[name='street'][value='${street}']`).prop('checked', true);

    // Update map to match
    refresh();

    // Close the modal
    $('*').css('cursor', '');
    modal.hide();
}

// On document ready
$(async () => {
    // Load page with appropriate styling
    dark = await (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);  // Get the users browser dark / light mode preference

    await Promise.all([
        (async () => {
            $('body').addClass(dark ? 'dark-theme' : 'light-theme');  // Set styling variables based on theme
            $('#style-switch').html(dark ? 'light_mode' : 'dark_mode');  // Set theme switch symbol
            // Update styling when clicked
            $('#style-switch').click(() => {
                // Indiciate progress
                $('*').css('cursor', 'wait');

                // Switch styling variables
                $('body').toggleClass('dark-theme');
                $('body').toggleClass('light-theme');

                // Switch symbol
                $('#style-switch').html(dark ? 'dark_mode' : 'light_mode')

                // Update map styling
                map.setStyle(dark ? 'mapbox://styles/seanbrooker/clx3zjjug001n01mwhyf4ex4q' : 'mapbox://styles/seanbrooker/clvxa3q1i01ro01q17rom1b2o')
                map.once('styledata', async () => {
                    await loadData();
                    await refresh();
                    $('*').css('cursor', '');
                });
                dark = !dark
            });
        })(),
        (async () => {
            // Init map
            mapboxgl.accessToken = accessKey;
            map = new mapboxgl.Map({
                container: 'map',
                style: dark ? 'mapbox://styles/seanbrooker/clvxa3q1i01ro01q17rom1b2o' : 'mapbox://styles/seanbrooker/clx3zjjug001n01mwhyf4ex4q',
                maxBounds: [
                    [144.90259490906936, -37.8380567022436],
                    [145.00490494442744, -37.76095901624997]
                ],
                pitchWithRotate: false,
                bounds: [
                    [145.00490494442744, -37.76095901624997],
                    [144.90259490906936, -37.8380567022436]
                ],
                customAttribution: 'Design: Sean Brooker | Data: City of Melbourne, 2024',
                performanceMetricsCollection: false,
            });
            map.on('load', initMap)
        })(),
        (async () => {
            // Init modal
            modal = new bootstrap.Modal('#modal', {});
            $('#mdl_select_station').val('');
            modal.show();
        })(),
        (async () => {
            // Filter update listeners
            $('.btn-test').on('change', refresh);
            $('#select_station').on('change', refresh);
        })()
    ]).then(() => console.log("Initialised"));
});
