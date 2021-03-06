

// HACK: see http://stackoverflow.com/questions/4728852/forcing-an-openlayers-markers-layer-to-draw-on-top-and-having-selectable-layers
// This fixes a problem whereby the marker layer doesn't 
// respond to click events
OpenLayers.Handler.Feature.prototype.activate = function() {
    var activated = false;
    if (OpenLayers.Handler.prototype.activate.apply(this, arguments)) {
        //this.moveLayerToTop();
        this.map.events.on({
            "removelayer": this.handleMapEvents,
            "changelayer": this.handleMapEvents,
            scope: this
        });
        activated = true;
    }
    return activated;
};

function each(array, fn) {
    for (
        var i = 0;
        i < array.length;
        ++i
    ) {
        fn(array[i], i)
    }
}

function base64_encode (s) {
    var base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split("");
    var r = ''; 
    var p = ''; 
    var c = s.length % 3;
    if (c > 0) { 
        for (; c < 3; c++) { 
            p += '='; 
            s += '\0'; 
        } 
    }
    for (c = 0; c < s.length; c += 3) {
        if (c > 0 && (c / 3 * 4) % 76 == 0) { 
            r += '\r\n'; 
        }
        var n = (
            (s.charCodeAt(c) << 16) + 
            (s.charCodeAt(c+1) << 8) + 
            s.charCodeAt(c+2)
        )
        n = [
            (n >>> 18) & 63, 
            (n >>> 12) & 63, 
            (n >>> 6) & 63, 
            n & 63
        ];
        r += (
            base64chars[n[0]] + 
            base64chars[n[1]] + 
            base64chars[n[2]] + 
            base64chars[n[3]]
        )
    }
    return r.substring(0, r.length - p.length) + p;
}

function create_bitmap_data() {
    function encode(number, bytes) {
        var oldbase = 1
        var string = ''
        for (var x = 0; x < bytes; x++) {
            var byte = 0
            if (number != 0) {
                var base = oldbase * 256
                byte = number % base
                number = number - byte
                byte = byte / oldbase
                oldbase = base
            }
            string += String.fromCharCode(byte)
        }
        return string
    }
    var width = colour_map.length;

    var data = [];
    for (var x = 0; x < width; x++) {
        var value = colour_map[Math.floor((x/width) * colour_map.length)]
        data.push(
            String.fromCharCode(
                value[2],
                value[1],
                value[0]
            )
        )
    }
    padding = (
        width % 4 ? 
        '\0\0\0'.substr((width % 4) - 1, 3):
        ''
    );
    data.push(padding + padding + padding)
    var data_bytes = data.join('')

    var info_header = (
        encode(40, 4) + // Number of bytes in the DIB header (from this point)
        encode(width, 4) + // Width of the bitmap in pixels
        encode(1, 4) + // Height of the bitmap in pixels
        '\x01\0' + // Number of color planes being used
        encode(24, 2) + // Number of bits per pixel
        '\0\0\0\0'+ // BI_RGB, no Pixel Array compression used
        encode(data_bytes.length, 4)+ // Size of the raw data in the Pixel Array (including padding)
        encode(2835, 4)+ //Horizontal resolution of the image
        encode(2835, 4)+ // Vertical resolution of the image
        '\0\0\0\0\0\0\0\0'
    );

    var header_length = 14 + info_header.length
    return (
        'BM'+
        encode(header_length + data_bytes.length, 4)+
        '\0\0\0\0'+
        encode(header_length, 4)
    ) + info_header + data_bytes
};

function node(tag_name, attrs, children) {
    var result = $(document.createElement(tag_name))
    for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) {
            result.attr(key, attrs[key])
        }
    }
    result.append.apply(result, children)
    return result
}
function NodeGenerator(tag_name) {
    return function (/* attrs, child1... */) {
        var attrs = Array.prototype.shift.apply(arguments)
        return node(tag_name, attrs, arguments)
    }
}

INPUT = NodeGenerator('input')
DIV = NodeGenerator('div')
TABLE = NodeGenerator('table')
TR = NodeGenerator('tr')
TD = NodeGenerator('td')
SPAN = NodeGenerator('span')
IMG = NodeGenerator('img')
TEXTAREA = NodeGenerator('textarea')

var ColourScale = OpenLayers.Class(OpenLayers.Control, {
    /* The colour key is implemented as an OpenLayers control
       so that it gets rendered on the printed map
       attributes:
         plugin
    */
    destroy: function() {
        var colour_scale = this
        colour_scale.deactivate();
        OpenLayers.Control.prototype.destroy.apply(colour_scale, arguments);
    },
    
    activate: function() {
        var colour_scale = this
        if (OpenLayers.Control.prototype.activate.apply(colour_scale, arguments)) {
            // show colours
            colour_scale.$key_colour_scale_img.attr(
                'src',
                'data:image/bmp;base64,'+
                base64_encode(create_bitmap_data())
            )
            // when the user changes limits, the map colours update instantly
            colour_scale.use_callback = function () {
                if (!!colour_scale.use_limits) {
                    colour_scale.with_limits(colour_scale.use_limits)
                }
            }
            colour_scale.$lower_limit.change(colour_scale.use_callback)
            colour_scale.$upper_limit.change(colour_scale.use_callback)
            return true;
        } else {
            return false;
        }
    },
    
    deactivate: function() {
        var colour_scale = this
        if (OpenLayers.Control.prototype.deactivate.apply(colour_scale, arguments)) {
            
            return true;
        } else {
            return false;
        }
    },
    
    with_limits: function (use_limits) {
        // immediately use the limits
        var colour_scale = this
        use_limits(
            parseFloat(colour_scale.$lower_limit.attr('value')),
            parseFloat(colour_scale.$upper_limit.attr('value'))
        )
    },
    
    on_change: function (use_limits) {
        // provide a callback for when the limits change
        // use_limits needs to accept min and max
        this.use_limits = use_limits
    },
    
    update_from: function (
        new_units, 
        max_value, 
        min_value
    ) {
        // Sets units, and limits (rounded sensibly) from supplied arguments.
        // If the limit lock checkbox is checked, doesn't change limits unless
        // the units change.
        // Calls the callback supplied in on_change with the limits.
        var colour_scale = this
        
        var previous_units = colour_scale.$units.html()
        colour_scale.$units.html(new_units)

        if (
            // user can lock limits
            !colour_scale.$limit_lock.is(':checked')
            
            // but if units change, old limits become meaningless
            || previous_units != new_units
        ) {
            // sensible range
            var significant_digits = 2
            function scaling_factor(value) {
                return 10.0^(
                    Math.floor(
                        Math.log(Math.abs(value)) / Math.LN10
                    ) - (significant_digits - 1)
                )
            }
            function sensible(value, round) {
                if (value == 0.0) {
                    return 0.0
                }
                else {
                    factor = scaling_factor(value)
                    return round(value/factor) * factor
                }
            }
            range_mag = scaling_factor(
                sensible(max_value, Math.ceil) - 
                sensible(min_value, Math.floor)
            )
                
            // function set_scale(min_value, max_value) {
            min_value = Math.floor(min_value/range_mag) * range_mag
            max_value = Math.ceil(max_value/range_mag) * range_mag
            
            colour_scale.$lower_limit.attr('value', min_value)
            colour_scale.$upper_limit.attr('value', max_value)
        }
        else {
            min_value = parseFloat(colour_scale.$lower_limit.attr('value'))
            max_value = parseFloat(colour_scale.$upper_limit.attr('value'))
        }
        colour_scale.min_value = min_value
        colour_scale.max_value = max_value
        colour_scale.use_callback()
    },
            
    draw: function() {
        var colour_scale = this
        OpenLayers.Control.prototype.draw.apply(colour_scale, arguments);
        
        colour_scale.$lower_limit = INPUT({size:5, value:'Min'})
        colour_scale.$upper_limit = INPUT({size:5, value:'Max', 
            style:'text-align:right;'
        })
        colour_scale.$limit_lock = INPUT({type:'checkbox', name:'key-lock', id:'key_lock'})
        colour_scale.$limit_lock_label = $('<label for="key_lock">Lock limits between queries</label>')
        colour_scale.$key_colour_scale_img = IMG({width:'100%', height:'15px'})
        colour_scale.$units = SPAN({}, 'Units')
        var $div = colour_scale.$inner_div = DIV({
                style:'width: 180px; position:absolute; top: 10px; left:55px;'
            },
            TABLE({
                    width:'100%',
                    style:'background-color:white; border:1px solid #CCC;'
                },
                TR({}, 
                    TD({
                            style:'width:33%; text-align:left;'
                        },
                        colour_scale.$lower_limit
                    ),
                    TD({
                            style:'text-align:center;'
                        },
                        colour_scale.$units
                    ),
                    TD({
                            style:'width:33%; text-align:right;'
                        },
                        colour_scale.$upper_limit
                    )
                )
                // key_scale_tr (unused)
            ),
            colour_scale.$key_colour_scale_img,
            colour_scale.$limit_lock,
            colour_scale.$limit_lock_label
        )
        /*
        // code that draws a scale on the colours as lines, to aid 
        // interpretation. Doesn't work well for some scales
        var scale_divisions = range/range_mag
        alert(''+range+' '+range_mag+' '+scale_divisions)
        
        var scale_html = '';
        for (
            var i = 0;
            i < scale_divisions-1;
            i++
        ) {
            scale_html += '<td style="border-left:1px solid black">&nbsp;</td>'
        }
        $('#id_key_scale_tr').html(
            scale_html+
            '<td style="border-left:1px solid black; border-right:1px solid black;">&nbsp;</td>'
        )
        */

        $(colour_scale.div).append($div)
        $div.show()
        return colour_scale.div
    },
    
    print_mode: function () {
        var colour_scale = this
        colour_scale.$limit_lock.hide()
        colour_scale.$limit_lock_label.hide()
        colour_scale.$inner_div.css('width', 300)
        colour_scale.$inner_div.css('left', 10)
    },
    CLASS_NAME: 'ColourScale'
});

var TextAreaAutoResizer = function(
    $text_area,
    min_height,
    max_height
) {
    var resizer = this
    resizer.min_height = min_height || 0
    resizer.max_height = max_height || Infinity

    function resize(force) {
        var value_length = $text_area.val().length, 
            $text_area_width = $text_area.width
        if (
            force || (
                value_length != resizer.previous_value_length || 
                $text_area_width != resizer.previous_width
            )
        ) {
            $text_area.height(0)
            var height = Math.max(
                resizer.min_height,
                Math.min(
                    $text_area[0].scrollHeight,
                    resizer.max_height
                )
            )
            $text_area.css('overflow', 
                $text_area.height() > height ? 'auto' : 'hidden'
            )
            $text_area.height(height)

            resizer.previous_value_length = value_length
            resizer.previous_width = $text_area_width
        }
        return true;
    }
    resizer.resize = resize
    resize()
    $text_area.css('padding-top', 0)
    $text_area.css('padding-bottom', 0)
    $text_area.bind('keyup', resize)
    $text_area.bind('focus', resize)
    return resizer
}

var QueryBox = OpenLayers.Class(OpenLayers.Control, {
    CLASS_NAME: 'QueryBox',
    destroy: function() {
        var query_box = this
        query_box.deactivate()
        query_box.resizer.destroy()
        delete query_box.resizer
        OpenLayers.Control.prototype.destroy.apply(query_box, arguments)
    },
    
    activate: function() {
        var query_box = this
        if (OpenLayers.Control.prototype.activate.apply(query_box, arguments)) {
            return true
        } else {
            return false
        }
    },
    
    deactivate: function() {
        var query_box = this
        if (OpenLayers.Control.prototype.deactivate.apply(query_box, arguments)) {
            
            return true
        } else {
            return false
        }
    },
    
    update: function (
        query_expression
    ) {
        var query_box = this
        $(query_box.div).css('background-color', 'white')
        query_box.$text_area.val(query_expression)
        query_box.$update_button.hide()
        query_box.previous_query = query_expression
        query_box.resizer.resize()
    },

    error: function (
        position
    ) {
        // inform the query box that there is an error, 
        var query_box = this
        var text = query_box.$text_area.val()
        var message = '# Syntax error (highlighted):\n'
        if (text.substr(0, message.length) == message) {
            message = ''
        }
        // highlight where it starts
        var following_text = text.substr(position)
        var selection_size = following_text.search(new RegExp('\\s|$'))
        if (
            selection_size + message.length <= 0
        ) {
            selection_size = following_text.search(new RegExp('\n|$'))
        }
        query_box.$text_area.blur()
        
        query_box.$text_area.val(message + text)
        
        var textarea = query_box.$text_area[0]
        textarea.setSelectionRange(
            position + message.length, 
            position + message.length + selection_size
        )
        $(query_box.div).css('background-color', 'red')
    },

    draw: function() {
        var query_box = this
        OpenLayers.Control.prototype.draw.apply(query_box, arguments);
        var $query_box_div = $(query_box.div)
        var $text_area = query_box.$text_area = TEXTAREA({
            style: (
                'border: none;'+
                'width: 100%;'+
                'font-family: Monaco, Lucida Console, Courier New, monospace;'+
                'font-size: 0.9em;'
            )
        },
            'Query'
        )
        
        var $update_button = query_box.$update_button = INPUT({
            type:'button',
            value:'Compute and show on map',
            style:'margin-top:5px;'
        })
        $update_button.hide()
        $update_button.click(function () {
            query_box.updated(query_box.$text_area.val())
        })
        $query_box_div.append($text_area)
        $query_box_div.append(
            DIV({
                    style:'text-align: center;'
                }, 
                $update_button
            )
        )
        
        function show_update_button() {
            $update_button.show()
            //$update_button.toggle($text_area.html() != query_box.previous_query)
        }

        $text_area.bind('keyup', show_update_button)

        $text_area.show()
        query_box.resizer = new TextAreaAutoResizer(
            $text_area,
            15
        )
        $query_box_div.css({
            position: 'absolute',
            bottom: '10px',
            left: '120px',
            right: '160px',
            backgroundColor: 'white',
            border: '1px solid black',
            padding: '0.5em'
        })
        return query_box.div
    },

    print_mode: function () {
        var query_box = this
        query_box.$text_area.css('text-align', 'center')
    }
});


colour_map = []
function compute_colour_map() {
    var i;
    with (Math) {
        /*
        // Blue green red, cosines,
        for (i = -900; i < 900; i++) {
            var x = i/1000 * PI
            var red = floor((1- (2 * abs(PI/2-x))/PI) * 255) //floor(sin(x) * 255)
            var green = floor((1- (2 * abs(x))/PI) * 255) //floor(cos(x) *255)
            var blue = floor((1- (2 * abs(PI/2+x))/PI) * 255) //floor(-sin(x) *255)
            colour_map.push([
                red < 0 ? 0 : red,
                green < 0 ? 0 : green,
                blue < 0 ? 0 : blue
            ])
        }
        */
        for (i = -500; i < 900; i++) {
            var x = i/1000 * PI
            var red = floor(sin(x) * 255)
            var green = floor(sin(x + (PI/3)) *255)
            var blue = floor(sin(x + (2 * PI/3)) *255)
            colour_map.push([
                red < 0 ? 0 : red,
                green < 0 ? 0 : green,
                blue < 0 ? 0 : blue
            ])
        }
    }
}
compute_colour_map()

var FilterBox = OpenLayers.Class(OpenLayers.Control, {
    CLASS_NAME: 'FilterBox',
    // updated(filter_function): callback
    // example: object with example attributes, should match places

    destroy: function() {
        var filter_box = this
        filter_box.deactivate()
        filter_box.resizer.destroy()
        OpenLayers.Control.prototype.destroy.apply(filter_box, arguments)
    },
    
    activate: function() {
        var filter_box = this
        if (OpenLayers.Control.prototype.activate.apply(filter_box, arguments)) {
            return true
        } else {
            return false
        }
    },
    
    deactivate: function() {
        var filter_box = this
        if (OpenLayers.Control.prototype.deactivate.apply(filter_box, arguments)) {
            
            return true
        } else {
            return false
        }
    },
    
    draw: function() {
        var filter_box = this
        OpenLayers.Control.prototype.draw.apply(filter_box, arguments);
        var $filter_box_div = $(filter_box.div)
        var $text_area = filter_box.$text_area = TEXTAREA({
            style: (
                'border: none;'+
                'width: 100%;'+
                'font-family: Monaco, Lucida Console, Courier New, monospace;'+
                'font-size: 0.9em;'+
                'text-align: center;'+
                'overflow: scroll;'
            )
        },
            filter_box.initial_filter || 'unfiltered'
        )
        
        $filter_box_div.append($text_area)
        
        var $update_button = filter_box.$update_button = INPUT({
            type:'button',
            value:'Filter map overlay',
            style:'margin-top:5px;'
        })
        $update_button.hide()
        $update_button.click(
            function () {
                var $text_area = filter_box.$text_area
                var filter_expression = $text_area.val()
                if (filter_expression == '') {
                    var filter_function = function () { return true }
                    $text_area.val('unfiltered')
                }
                else {
                    try {
                        filter_function = filter_box.create_filter_function(
                            $text_area.val()
                        )
                        // test it a bit
                        filter_function(filter_box.example, 0)
                    }
                    catch (error) {
                        $(filter_box.div).css('background-color', 'red')
                        var error_name = error.name
                        $(filter_box.div).attr('title', error.message)
                        if (
                            error_name == 'ReferenceError'
                        ) {
                            var bad_ref = error.message.substr(
                                error.message.lastIndexOf(':') + 2
                            )
                            var bad_ref_first_pos = filter_expression.indexOf(bad_ref)
                            $text_area[0].setSelectionRange(
                                bad_ref_first_pos,
                                bad_ref_first_pos + bad_ref.length
                            )
                            return
                        }
                        else {
                            throw error
                        }
                        return
                    }
                }
                filter_box.updated(filter_function)
                filter_box.$update_button.hide()
                $(filter_box.div).css('background-color', 'white')
            }
        )
        $filter_box_div.append($text_area)
        $filter_box_div.append(
            DIV({
                    style:'text-align: center;'
                }, 
                $update_button
            )
        )
        
        function show_update_button() {
            $update_button.show()
        }

        $text_area.bind('keyup', show_update_button)

        $text_area.show()
        filter_box.resizer = new TextAreaAutoResizer(
            $text_area,
            15
        )

        $filter_box_div.css({
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '200px',
            backgroundColor: 'white',
            border: '1px solid black',
            padding: '0.5em'
        })
        return filter_box.div
    }
});



// Shapes on the map
function Vector(geometry, attributes, style) {
    style.strokeColor= 'none'
    style.fillOpacity= 0.8
    style.strokeWidth = 1

    return new OpenLayers.Feature.Vector(
        geometry, attributes, style
    )
}
function Polygon(components) {
    return new OpenLayers.Geometry.Polygon(components)
}
function Point(lon, lat) {
    var point = new OpenLayers.Geometry.Point(lat, lon)
    return point.transform(
        S3.gis.proj4326,
        S3.gis.projection_current
    )
}
function LinearRing(point_list) {
    point_list.push(point_list[0])
    return new OpenLayers.Geometry.LinearRing(point_list)
}


ClimateDataMapPlugin = function (config) {
    var plugin = this // let's be explicit!
    plugin.data_type_option_names = config.data_type_option_names
    plugin.parameter_names = config.parameter_names
    plugin.aggregation_names = config.aggregation_names
    plugin.year_min = config.year_min 
    plugin.year_max = config.year_max

    plugin.data_type_label = config.data_type_label
    plugin.overlay_data_URL = config.overlay_data_URL
    plugin.places_URL = config.places_URL
    plugin.chart_URL = config.chart_URL
    plugin.data_URL = config.data_URL
    
    plugin.chart_popup_URL = config.chart_popup_URL
    plugin.buy_data_popup_URL = config.buy_data_popup_URL
    plugin.request_image_URL = config.request_image_URL
    
    var display_mode = config.display_mode
    if (config.initial_query_expression) {
        var initial_query_expression = decodeURI(
            config.initial_query_expression
        )
    }
    else {
        var initial_query_expression = (
            plugin.aggregation_names[0]+'('+
                '"'+ //form_values.data_type+' '+
                plugin.parameter_names[0].replace(
                    new RegExp('\\+','g'),
                    ' '
                )+'", '+
                'From('+plugin.year_min+'), '+
                'To('+plugin.year_max+')'+
            ')'
        )
    }
    var initial_filter = decodeURI(config.initial_filter || 'unfiltered')
    
    delete config
    
    plugin.last_query_expression = null
    
    plugin.places = {}
    var months = [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ]
    
    plugin.create_filter_function = function (filter_expression) {
        var replacements = {
            '(\\W)and(\\W)': '$1&&$2',
            '(^|\\W)not(\\W)': '$1!$2',
            '(\\W)or(\\W)': '$1||$2',
            '([^=<>])=([^\\=])': '$1==$2'
        }
        for (var pattern in replacements) {
            if (replacements.hasOwnProperty(pattern)) {
                var reg_exp = new RegExp(pattern, 'g')
                filter_expression = filter_expression.replace(
                    reg_exp, replacements[pattern]
                )
            }
        }

        var function_string = (
            'unfiltered = true\n'+
            'with (Math) {'+
                'with (place) { '+
                    'return '+ filter_expression +
                '}'+
            '}'
        )
        var filter_function = new Function(
            'place', 
            'value', 
            function_string
        )
        return filter_function
    }
    if (initial_filter) {
        plugin.filter = plugin.create_filter_function(initial_filter)
    }
    
    plugin.setup = function () {
        var overlay_layer = plugin.overlay_layer = new OpenLayers.Layer.Vector(
            'Query result values',
            {
                isBaseLayer:false,                                
            }
        );
        map.addLayer(overlay_layer)
        // hovering over a square pops up a detail box
        function onFeatureSelect(feature) {
            var info = [
                // popup is styled with div.olPopup
                '<div class="place_info_popup">', 
                'value: ', feature.attributes.value, '<br />'
                //'</li>'
            ]
            var place = plugin.places[feature.attributes.place_id]
            if (!!place) {
                for (var p in place) {
                    if (place.hasOwnProperty(p)) {
                        value = place[p]
                        if (!!value) {
                            info.push(
                                //'<li>',
                                p,': ', value,
                                //'</li>'
                                '<br />'
                            )
                        }
                    }
                }
            }
            info.push('</div>')
            var popup = new OpenLayers.Popup(
                'info_bubble', 
                feature.geometry.getBounds().getCenterLonLat(),
                new OpenLayers.Size(170, 125),
                info.join(''),
                true
            )
            feature.popup = popup
            map.addPopup(popup)
        }
        function onFeatureUnselect(feature) {
            map.removePopup(feature.popup);
            feature.popup.destroy();
            feature.popup = null;
        }
        var hoverControl = new OpenLayers.Control.SelectFeature(
            overlay_layer,
            {
                title: 'Show detail by hovering over a square',
                hover: true,
                onSelect: onFeatureSelect,
                onUnselect: onFeatureUnselect
            }
        )
        map.addControl(hoverControl)
        hoverControl.activate()

        // selection
        OpenLayers.Feature.Vector.style['default']['strokeWidth'] = '2'
        var selectCtrl = new OpenLayers.Control.SelectFeature(
            overlay_layer,
            {
                clickout: true,
                toggle: false,
                toggleKey: 'altKey',
                multiple: false,
                multipleKey: 'shiftKey',
                hover: false,
                box: true,
                onSelect: function (feature) {
                    feature.style.strokeColor = 'black'
                    feature.style.strokeDashstyle = 'dash'
                    overlay_layer.drawFeature(feature)
                    plugin.show_chart_button.enable()
                },
                onUnselect: function (feature) {
                    // This doesn't always get called, even when the feature
                    // is unselected. Tried using setTimeout, no joy.
                    feature.style.strokeColor = 'none'
                    overlay_layer.drawFeature(feature)
                    if (plugin.overlay_layer.selectedFeatures.length == 0) {
                        plugin.show_chart_button.disable()
                    }
                }
            }
        )
                
        map.addControl(selectCtrl)

        selectCtrl.activate()
        $.ajax({
            url: plugin.places_URL,
            dataType: 'json',
            success: function (places_data) {
                // add marker layer for places
                var markers = new OpenLayers.Layer.Markers( "Observation stations" );
                var size = new OpenLayers.Size(21,25)
                var offset = new OpenLayers.Pixel(-(size.w/2), -size.h)
                var icon = new OpenLayers.Icon(
                    'http://www.openlayers.org/dev/img/marker.png', size, offset
                )
                var show_place_info_popup = function (event) { 
                    var marker = this
                    var place = marker.place
                    var info = [
                        // popup is styled with div.olPopup
                        '<div class="place_info_popup">', 
                    ]
                    function add_attribute(attribute) {
                        var value = place[attribute]
                        if (!!value) {
                            info.push(
                                //'<li>',
                                attribute,': ', value,
                                //'</li>'
                                '<br />'
                            )
                        }
                    }
                    add_attribute('name')
                    add_attribute('latitude')
                    add_attribute('longitude')
                    add_attribute('elevation')
                    
                    info.push('</div>')

                    var popup = new OpenLayers.Popup(
                        'info_bubble', 
                        marker.lonlat,
                        new OpenLayers.Size(170, 125),
                        info.join(''),
                        true
                    )
                    marker.popup = popup
                    map.addPopup(popup)
                    function remove_place_info_popup() {
                        map.removePopup(marker.popup);
                        marker.popup.destroy();
                        marker.popup = null;
                    }
                    marker.events.register('mouseup', marker,
                        remove_place_info_popup
                    )
                    marker.events.register('mouseout', marker, 
                        remove_place_info_popup
                    )
                    OpenLayers.Event.stop(event);
                }
                each(
                    places_data,
                    function (place_data_pair) {
                        // store place data
                        var place_info = place_data_pair[1]
                        plugin.places[place_data_pair[0]] = place_info
                        
                        // add marker
                        if (place_info.station_id) {
                            var coordinates = new OpenLayers.LonLat(
                                parseFloat(place_info.longitude),
                                parseFloat(place_info.latitude)
                            ) 
                            coordinates.transform(
                                S3.gis.proj4326,
                                S3.gis.projection_current
                            )
                            var marker = new OpenLayers.Marker(
                                coordinates,
                                icon.clone()
                            )
                            marker.place = place_info
                            marker.events.register('mousedown', marker,
                                show_place_info_popup
                            )
                            markers.addMarker(marker)
                        }
                    }
                )
                markers.setVisibility(false)
                map.addLayer(markers);

                plugin.update_map_layer(initial_query_expression)
                plugin.filter_box = new FilterBox({
                    updated: function (filter_function) {
                        plugin.filter = filter_function
                        plugin.colour_scale.with_limits(
                            plugin.render_map_layer
                        )
                    },
                    example: places_data[0][1],
                    initial_filter: initial_filter
                })
                map.addControl(plugin.filter_box)
            },
            error: function (jqXHR, textStatus, errorThrown) {
                plugin.set_status(
                    '<a target= "_blank" href="places">Could not load place data!</a>'
                )
            }
        })
        var print_window = function() {
            // this breaks event handling in the widgets, but that's ok for printing
            var map_div = map.div
            var $map_div = $(map_div)
            $(map_div).remove()
            var body = $('body')
            body.remove()
            var new_body = $('<body></body>')
            new_body.css({position:'absolute', top:0, bottom:0, left:0, right:0})
            new_body.append($map_div)
            $('html').append(new_body)
            $map_div.css('width', '100%')
            $map_div.css('height', '100%')
            map.updateSize()
        }
        
        plugin.expand_to_full_window = function() {
            // this makes the map use the full browser window, 
            // events still work, but it leaves a scroll bar
            $(map.div).css({
                position:'fixed',
                top:0, bottom:0, left:0, right:0,
                width:'100%', height:'100%',
                zIndex: 10000
            })
            $('body').children().css('display', 'none')
            $('div.fullpage').css('display', '')
            $('html').css('overflow', 'hidden')
            map.updateSize()
        }

        // make room by closing the layer tree
        setTimeout(
            function () {
                S3.gis.layerTree.collapse()
            },
            1000
        )
    }
    
    var conversion_functions = {
        'Kelvin': function (value) {
            return value - 273.16
        }
    }
    var display_units_conversions = {
        'Kelvin': '&#176;C',
        'Δ Kelvin': 'Δ &#176;C'
    }
    
    plugin.render_map_layer = function(min_value, max_value) {
        plugin.overlay_layer.destroyFeatures()
        var feature_data = plugin.feature_data
        var place_ids = feature_data.keys
        var values = feature_data.values
        var units = feature_data.units
        
        var converter = plugin.converter
        var display_units = plugin.display_units
        
        var range = max_value - min_value
        var features = []
        var filter = plugin.filter || function () { return true }
        for (
            var i = 0;
            i < place_ids.length;
            i++
        ) {
            var place_id = place_ids[i]
            var value = values[i]
            var place = plugin.places[place_id]
            var converted_value = converter(value)
            if (
                filter(place, converted_value)
            ) {
                var normalised_value = (converted_value - min_value) / range
                if (
                    (0.0 < normalised_value) && 
                    (normalised_value < 1.0)
                ) {
                    var colour_value = colour_map[Math.floor(
                        normalised_value * colour_map.length
                    )]
                    function hexFF(value) {
                        return (256+value).toString(16).substr(-2)
                    }
                    var colour_string = (
                        '#'+
                        hexFF(colour_value[0]) + 
                        hexFF(colour_value[1]) + 
                        hexFF(colour_value[2])
                    )
                    var lat = place.latitude
                    var lon = place.longitude
                    north = lat + 0.05
                    south = lat - 0.05
                    east = lon + 0.05
                    west = lon - 0.05

                    features.push(                            
                        Vector(
                            Polygon([
                                LinearRing([
                                    Point(north,west),
                                    Point(north,east),
                                    Point(south,east),
                                    Point(south,west)
                                ])
                            ]),
                            {
                                value: converted_value.toPrecision(3)+' '+display_units,
                                id: id,
                                place_id: place_id
                            },
                            {
                                fillColor: colour_string
                            }
                        )
                    )
                }                        
            }
        }
        plugin.overlay_layer.addFeatures(features)
        
        plugin.request_image = function () {
            window.location.href = encodeURI([
                plugin.request_image_URL, 
                '?expression=', plugin.last_query_expression ,
                '&filter=', plugin.filter_box.$text_area.val() ,
                '&width=', $('html').width(),
                '&height=', $('html').height()
            ].join(''))
        }
        if (display_mode == 'print') {
            var allowed_control_class_names = [
                "OpenLayers.Control.Attribution",
                "OpenLayers.Control.ScaleLine",
                "ColourScale",
                "FilterBox",
                "QueryBox"
            ]
            each(map.controls,
                function (control) {
                    if (    
                        allowed_control_class_names.indexOf(
                            control.__proto__.CLASS_NAME
                        ) == -1
                    ) {
                        $(control.div).hide()
                    }
                    else {
                        if (control.print_mode) {
                            control.print_mode()
                        }
                    }
                }
            )
            plugin.expand_to_full_window()
            map.updateSize()
            
            var images_waiting = []
            function print_if_no_more_images() {
                if (images_waiting.length == 0) {
                    // seems the last image may still not have been 
                    // rendered
                    setTimeout(function () {
                        window.print()
                    }, 10)
                }
            }
            
            function image_done(img) {
                var image_pos = images_waiting.indexOf(img)
                images_waiting.splice(image_pos, 1)
                print_if_no_more_images()
            }
            each(
                document.getElementsByTagName('img'),
                function (img) {
                    if (!img.complete) {
                        images_waiting.push(img)
                        $(img).load(image_done).error(image_done)
                        if (img.complete) {
                            image_done.call(img)
                        }
                    }
                }
            )
            print_if_no_more_images()
            setTimeout(function () { window.print() }, 10000 )
        }
    }
    
    plugin.update_query = function (query_expression) {
        plugin.query_box.update(query_expression)
        plugin.last_query_expression = query_expression
    }
    
    plugin.update_map_layer = function (
        query_expression
    ) {
        // request new features
        plugin.overlay_layer.destroyFeatures()
        plugin.set_status('Updating...')
        plugin.query_box.update(query_expression)
        $.ajax({
            url: plugin.overlay_data_URL,
            dataType: 'json',
            data: {
                query_expression: query_expression
            },
            //timeout: 1000 * 20, // timeout doesn't seem to work
            success: function(feature_data, status_code) {
                if (feature_data.length == 0) {
                    plugin.set_status(
                        'No data for this selection. Has it been imported?'
                    )
                } else {
                    plugin.feature_data = feature_data
                    var units = feature_data.units
                    var converter = plugin.converter = conversion_functions[units] || function (x) { return x }
                    var display_units = plugin.display_units = display_units_conversions[units] || units
                    var values = feature_data.values
                    
                    plugin.colour_scale.update_from(
                        display_units,
                        converter(Math.max.apply(null, values)), 
                        converter(Math.min.apply(null, values))
                    )
                    plugin.update_query(feature_data.understood_expression)
                    // not right place for this:
                    plugin.filter_box.resizer.resize(true)
                    plugin.set_status('')
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                var responseText = jqXHR.responseText
                var error_message = responseText.substr(
                    0, 
                    responseText.indexOf('<!--')
                )
                var error = $.parseJSON(error_message)
                if (error.error == 'SyntaxError') {
                    // don't update the last expression if it's invalid
                    plugin.query_box.update(error.understood_expression)
                    plugin.query_box.error(error.offset)
                }
                else {
                    if (
                        error.error == 'MeaninglessUnits' ||
                        error.error == 'TypeError'
                    ) {
                        window.plugin = plugin 
                        window.analysis = error.analysis
                        plugin.query_box.update(error.analysis)
                    }
                    else {
                        plugin.set_status(
                            '<a target= "_blank" href="'+
                                plugin.overlay_data_URL+'?'+
                                $.param(query_expression)+
                            '">Error</a>'
                        )
                    }
                }
            },
            complete: function (jqXHR, status) {
                if (status != 'success' && status != 'error') {
                    plugin.set_status(status)
                }
            }
        });
    }
    function SpecPanel(
        panel_id, panel_title, collapsed
    ) {
        function make_combo_box(
            data,
            fieldLabel,
            hiddenName,
            combo_box_size
        ) {
            var options = []
            each(
                data,
                function (option) {
                    options.push([option, option])
                }
            )
            var combo_box = new Ext.form.ComboBox({
                fieldLabel: fieldLabel,
                hiddenName: hiddenName,
                store: new Ext.data.SimpleStore({
                    fields: ['name', 'option'],
                    data: options
                }),
                displayField: 'name',
                typeAhead: true,
                mode: 'local',
                triggerAction: 'all',
                emptyText:'',
                selectOnFocus: true,
                forceSelection: true
            })
            combo_box.setSize(combo_box_size)
            if (!!options[0]) {
                combo_box.setValue(options[0][0])
            }
            return combo_box
        }

        var data_type_combo_box = make_combo_box(
            plugin.data_type_option_names,
            'Data type',
            'data_type',
            {
                width: 115,
                heigth: 25
            }
        )

        var variable_combo_box = make_combo_box(
            plugin.parameter_names,
            'Parameter',
            'parameter',
            {
                width: 160,
                heigth: 25
            }
        )
        
        var statistic_combo_box = make_combo_box(
            plugin.aggregation_names,
            'Statistic',
            'statistic',
            {
                width: 115,
                heigth: 25
            }
        )
        
        function inclusive_range(start, end) {
            var values = []
            for (
                var i = start;
                i <= end;
                i++
            ) {
                values.push(i)
            }
            return values
        }
        var years = inclusive_range(plugin.year_min, plugin.year_max)
        
        var from_year_combo_box = make_combo_box(
            years,
            null,
            'from_year',
            {width:60, height:25}
        )
        from_year_combo_box.setValue(plugin.year_min)
        
        var from_month_combo_box = make_combo_box(
            months,
            null,
            'from_month',
            {width:50, height:25}
        )
        var to_year_combo_box = make_combo_box(
            years,
            null,
            'to_year',
            {width:60, height:25}
        )
        to_year_combo_box.setValue(2011)
        var to_month_combo_box = make_combo_box(
            months,
            null,
            'to_month',
            {width:50, height:25}
        )
        
        var month_filter = []
        // if none are picked, don't do annual aggregation
        // if some are picked, aggregate those months
        // if all are picked, aggregate for whole year
        each('DNOSAJJMAMFJ',
            function (
                month_letter,
                month_index
            ) {
                month_filter.unshift(
                    { html:month_letter, border: false }
                )
                month_filter.push(
                    new Ext.form.Checkbox({
                        name: 'month-'+month_index,
                        checked: true
                    })
                )
            }
        )
        var annual_aggregation_check_box = new Ext.form.Checkbox({
            name: 'annual_aggregation',
            checked: true,
            fieldLabel: 'Annual aggregation'
        })
        var month_checkboxes_id = panel_id+'_month_checkboxes'
        annual_aggregation_check_box.on('check', function(a, value) {
            var month_checkboxes = $('#'+month_checkboxes_id)
            if (value) {
                month_checkboxes.show(300)
            }
            else {
                month_checkboxes.hide(300)
            }
        })

        return new Ext.FormPanel({
            id: panel_id,
            title: panel_title,
            collapsible: true,
            collapseMode: 'mini',
            collapsed: collapsed,
            labelWidth: 60,
            items: [{
                region: 'center',
                items: [
                    new Ext.form.FieldSet({
                        style: 'margin: 0px; border: none;',
                        items: [
                            //data_type_combo_box,
                            variable_combo_box,
                            statistic_combo_box,
                            annual_aggregation_check_box,
                            // month filter checkboxes
                            {
                                id: month_checkboxes_id,
                                border: false,
                                layout: {
                                    type: 'table',
                                    columns: 12,
                                },
                                defaults: {
                                    width: '16px',
                                    height: '1.3em',
                                    style: 'margin: 0.1em;'
                                },
                                items: month_filter
                            },
                            new Ext.form.CompositeField(
                                {
                                    fieldLabel: 'From',
                                    items:[
                                        from_year_combo_box,
                                        from_month_combo_box
                                    ]
                                }
                            ),
                            new Ext.form.CompositeField(
                                {
                                    fieldLabel: 'To',
                                    items:[
                                        to_year_combo_box,
                                        to_month_combo_box
                                    ]
                                }
                            ),
                        ]
                    })
                ]
            }]
        })
    }
    
    function form_query_expression(ext_form) {
        form_values = ext_form.getValues()
        var month_names = []
        each(
            [0,1,2,3,4,5,6,7,8,9,10,11],
            function (
                month_number
            ) {
                if (
                    form_values['month-'+month_number] == 'on'
                ) {
                    month_names.push(
                        months[month_number+1]
                    )
                }
            }
        )
        return (
            [
                form_values.statistic,
                '(',
                    '"', form_values.parameter.replace(new RegExp('\\+','g'),' '), '", ',
                    'From(',
                        form_values.from_year ,
                        (form_values.from_month?', '+form_values.from_month:''),
                    '), ',
                    'To(',
                        form_values.to_year ,
                        (form_values.to_month?', '+form_values.to_month:''),
                    ')',
                    (
                        form_values.annual_aggregation ?
                        (', Months('+month_names.join(', ')+')'):''
                    ),
                ')'
            ].join('')
        )
    }

    plugin.addToMapWindow = function (items) {
        // create the panels
        var climate_data_panel = SpecPanel(
            'climate_data_panel',
            'Select data: (A)',
            false
        )
        // This button does the simplest "show me data" overlay
        plugin.update_map_layer_from_form = function () {
            plugin.update_map_layer(
                form_query_expression(climate_data_panel.getForm())
            )
        }
        var update_map_layer_button = new Ext.Button({
            text: 'Show on map (A)',
            disabled: false,
            handler: plugin.update_map_layer_from_form
        });
        climate_data_panel.addButton(update_map_layer_button)
        items.push(climate_data_panel)
        
        var comparison_panel = SpecPanel(
            'comparison_panel',
            'Compare with data (B)',
            true
        )
        // This button does the comparison overlay
        plugin.update_map_layer_from_comparison = function () {
            plugin.update_map_layer(
                
                form_query_expression(comparison_panel.getForm()) + ' - ' +
                form_query_expression(climate_data_panel.getForm())
            )
        }
        var update_map_layer_comparison_button = new Ext.Button({
            text: 'Compare on map (B - A)',
            disabled: false,
            handler: plugin.update_map_layer_from_comparison
        });
        comparison_panel.addButton(update_map_layer_comparison_button)
        items.push(comparison_panel)
        
        var show_chart_button = new Ext.Button({
            text: 'Show chart for selected places',
            disabled: true,
            handler: function() {
                // create URL
                var place_ids = []
                var place_names = []
                each(
                    plugin.overlay_layer.selectedFeatures, 
                    function (feature) {
                        var place_id = feature.attributes.place_id
                        place_ids.push(place_id)
                        var place = plugin.places[place_id]
                        place_names.push(
                            (place && (!!place.name)? place.name: place_id)
                        )
                    }
                )
                plugin.last_query_expression
                var query_expression = plugin.last_query_expression
                var spec = JSON.stringify({
                    place_ids: place_ids,
                    query_expression: query_expression
                })
                
                var chart_name = [
                    query_expression,
                    'for', (
                        place_ids.length < 4?
                        ': '+ place_names.join(', '):
                        place_ids.length+' places'
                    )
                ].join(' ')

                // get hold of a chart manager instance
                if (!plugin.chart_window) {
                    var chart_window = plugin.chart_window = window.open(
                        plugin.chart_popup_URL,
                        'chart', 
                        'width=660,height=600,toolbar=0,resizable=0'
                    )
                    chart_window.onload = function () {
                        chart_window.chart_manager = new chart_window.ChartManager(plugin.chart_URL)
                        chart_window.chart_manager.addChartSpec(spec, chart_name)
                    }
                    chart_window.onbeforeunload = function () {
                        delete plugin.chart_window
                    }
                } else {
                    // some duplication here:
                    plugin.chart_window.chart_manager.addChartSpec(spec, chart_name)
                }
            }
        })
        plugin.show_chart_button = show_chart_button
 
        // copied and pasted from the charting button
        var buy_data_button = new Ext.Button({
            text: 'Buy data',
            disabled: false,
            handler: function() {
                // create URL
                var place_ids = []
                var place_names = []
                each(
                    plugin.overlay_layer.selectedFeatures, 
                    function (feature) {
                        var place_id = feature.attributes.place_id
                        place_ids.push(place_id)
                        var place = plugin.places[place_id]
                        place_names.push(
                            (place && (!!place.name)? place.name: place_id)
                        )
                    }
                )
                plugin.last_query_expression
                var query_expression = plugin.last_query_expression
                var spec = JSON.stringify({
                    place_ids: place_ids,
                    query_expression: query_expression
                })
                var data_name = [
                    query_expression,
                    'for', (
                        place_ids.length < 4?
                        ': '+ place_names.join(', '):
                        place_ids.length+' places'
                    )
                ].join(' ')

                // get hold of a data manager instance
                if (!plugin.buy_data_window) {
                    var buy_data_window = plugin.buy_data_window = window.open(
                        plugin.buy_data_popup_URL,
                        'buy_data', 
                        'width=600,height=400,toolbar=0,resizable=0'
                    )
                    buy_data_window.onload = function () {
                        buy_data_window.data_manager = new buy_data_window.DataPurchaseManager(plugin.data_URL)
                        buy_data_window.data_manager.addDataPurchaseSpec(spec, data_name)
                    }
                    buy_data_window.onbeforeunload = function () {
                        delete plugin.buy_data_window
                    }
                } else {
                    // some duplication here:
                    plugin.buy_data_window.data_manager.addDataPurchaseSpec(spec, data_name)
                }
            }
        })
        plugin.buy_data_button = buy_data_button
       
        items.push(buy_data_button)
        
        items.push(show_chart_button)
        
        var print_button = new Ext.Button({
            text: 'Download printable map image',
            disabled: false,
            handler: function() {
                // make the map use the full window
                // plugin.full_window()
                // add a button on the map "Download image"
                plugin.request_image()
                // on clicking the button, the map is rendered and 
            }
        })
        plugin.print_button = print_button
        items.push(print_button)
        
        items.push({
            autoEl: {
                    tag: 'div',
                    id: 'error_div'
                }                
            }
        )
        plugin.set_status = function (html_message) {
            $('#error_div').html(html_message)
        }
        
        plugin.colour_scale = new ColourScale()
        plugin.colour_scale.on_change(plugin.render_map_layer)
        map.addControl(plugin.colour_scale)
        plugin.colour_scale.activate()

        plugin.query_box = new QueryBox({
            updated: plugin.update_map_layer
        })
        map.addControl(plugin.query_box)
                
        plugin.query_box.activate()
    }
}
