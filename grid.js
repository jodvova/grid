var columns = ['bspread','aspread','bs','nanny','vol','pos','strike','pos','vol','nanny','bs','bspread','aspread'];

$(document).ready(function(){ setup_system(); });

function trace(sys, msg) { if (sys.enable_trace) console.log("trace: " + msg); }
function assert(truth, msg) { if (!truth) { alsert(msg); undefined.cause_stacktrace; } }
function add_timestamp(url)
{
    url += url.indexOf("?") == -1 ? "?" : "&";
    url += "no_cache_ts=" + new Date().getTime();
    return url;
}
function try_get_local_value(name, def)
{
    if (name in localStorage)
        return localStorage[name];
    localStorage[name] = def;
    return def;
}
function set_local_value(name, val) {
    localStorage[name] = val;
}

function initialize_view(sys) 
{
    for (var i in sys.names) {
        var u = sys.names[i];
        var ref = "name" + i;
        $('<li class="nav-item"><a class="nav-link" href="#' + ref + '" data-toggle="tab">' + u.name + '</a></li>').appendTo('#names');
        $('<div id="name' + i + '" class="tab-pane fade"></div>').appendTo('.tab-content');

        var eid = "expiries" + i;
        $('<ul class="nav nav-pills mb-3" id="' + eid + '"></ul>').appendTo('#name' + i);

        for (var j in u.expiries) {
            var e = u.expiries[j];
            var id = "name" + i + "_exp" + j;
            $('<li class="nav-item"><a class="nav-link" href="#' + id + '" data-toggle="tab">' + e + '</a></li>').appendTo('#' + eid);
        }
    }
    $('#names li:eq(' + 0 + ') a').tab('show');
    select_name(sys, 0, 0);

    $('#names a').on('shown.bs.tab', function(event){
        var i = $(event.target).closest('li').index();
        var j = (sys.names.length - i) - 1;
        $('#name' + j).removeClass('in active');
        select_name(sys, i, 0);
    });

    $('#increase').click(function(){ increase_spread(sys); });
    $('#decrease').click(function(){ decrease_spread(sys); });
    $('#apply').click(function(){ apply_changes(sys); });
    $('#discard').click(function(){ discard_changes(sys); });

    $('alert-div').removeClass('show');

    $('#adjustment').val(u.adjustment);
    //$('#adjustment').blur(function(){
    $('#adjustment').on('blur', function() {
        var v = parseFloat($(this).val());
        if (isNaN(v)) {
            $(this).val(sys.selected_name.adjustment);
        }
        else {
            if (v != sys.selected_name.adjustment) {
                set_local_value(sys.selected_name.name + '_adjustment', v);
                sys.selected_name.adjustment = v;
                trace(sys, "changed adj on " + sys.selected_name.name + " to " + v.toFixed(3));
            }
        }
    });
    $('#apply_to_all_exp').click(function(){
        sys.selected_name.apply_all_expiries = this.checked;
        set_local_value(sys.selected_name.name + '_apply_all_expiries', this.checked);
    });
}

function initialize_table(sys)
{
    if (sys.table_init_done)
        return;
    var u = sys.selected_name;
    sys.table_body.empty();

    for (var i = 0; i < u.options.length; i += 2) {
        var c = u.options[i];
        var p = u.options[i + 1];
        if (c.expiry != sys.selected_exp)
            continue;

        sys.table_body.append(row = $('<tr/>'));
        row.cells = {};
        
        var cp = 0;
        columns.forEach(function(name) {
            var cell = $('<td/>');
            cell.row = row;
            cell[0].option = (cp == 0) ? c : p;
            row.cells[name] = cell[0];
            row.append(cell);            

            if (name == "strike") {
                cell.addClass('bg-warning');
                cp = 1;
            }
            else if (name == "bspread") {
                cell.mousedown(function() {
                    if (sys.selected_count['ask'] != 0)
                        return false;

                    sys.is_mousedown = true;
                    sys.selected_count['bid'] += $(this).hasClass('highlighted1') ? -1 : 1;
                    $(this).toggleClass('highlighted1');
                    return false;
                });
                cell.mouseover(function() {
                    if (sys.is_mousedown && sys.selected_count['ask'] == 0)
                    {
                        sys.selected_count['bid'] += $(this).hasClass('highlighted1') ? -1 : 1;
                        $(this).toggleClass('highlighted1');
                    }
                });
            }
            else if (name == "aspread") {
                cell.mousedown(function() {
                    if (sys.selected_count['bid'] != 0)
                        return false;

                    sys.is_mousedown = true;
                    sys.selected_count['ask'] += $(this).hasClass('highlighted2') ? -1 : 1;
                    $(this).toggleClass('highlighted2');
                    return false;
                });
                cell.mouseover(function() {
                    if (sys.is_mousedown && sys.selected_count['bid'] == 0)
                    {
                        sys.selected_count['ask'] += $(this).hasClass('highlighted2') ? -1 : 1;
                        $(this).toggleClass('highlighted2');
                    }
                });
            }
        });
    }
    $(document).mouseup(function(){ sys.is_mousedown = false; });

    sys.table_init_done = true;
}

function refresh_table(sys)
{
    if (!sys.table_init_done)
        initialize_table(sys);

    $('#options>tbody>tr').each(function(i, row){
        Object.keys(row.cells).forEach(function(j){
            var name = columns[j];
            var cell = $(row.cells[j]);
            var o = cell[0].option;

            if (name == "strike") {
                cell.text(o.strike);
            } else if (name == 'bspread') {
                cell.text(o.bspread.toFixed(3));
            } else if (name == 'aspread') {
                cell.text(o.aspread.toFixed(3));
            } else if (name == 'bs') {
                cell.text(o.bs.toFixed(3));
            } else if (name == 'nanny') {
                cell.text(o.nanny);
            } else if (name == 'pos') {
                cell.text(o.pos);
                if (o.pos > 0)
                {
                    cell.addClass('pos-long');
                    cell.removeClass('pos-short');
                }
                else if (o.pos < 0)
                {
                    cell.removeClass('pos-long');
                    cell.addClass('pos-short');
                }
                else
                {
                    cell.removeClass('pos-long');
                    cell.removeClass('pos-short');
                }
            }
    });
    });
}

function fetch_next(sys)
{
    if (sys.update_in_progress)
        return;
    if (sys.pending_updates.length == 0)
        return;

    sys.update_in_progress = true;
    var n = sys.pending_updates.shift();
    var url = n[0];
    url = add_timestamp(url)
    var i = url.indexOf("?");
    var f = url.substring(0, i);
    var l = url.substring(i + 1);
    $.ajax({
        dataType: "json",
        type: "POST",
        // data: l,
        url: url,
        success: function (data) {
            n[1](sys, data);
            sys.update_in_progress = false;
            fetch_next(sys);
        }
    }).fail(function() {
        var message = "failed to apply changes";
        alert(message);
    });
}

function queue_fetch(sys, url, callback)
{
    sys.pending_updates.push([url, callback]);
    fetch_next(sys);
}

function start_main_loop_timer(sys)
{
    sys.main_loop_timer = setTimeout(function() {
        queue_fetch(
            sys,
            "query.php?cmd=update",
            function(sys, data) {
                sys.main_loop_timer = null;
                update_data(sys, data);
                refresh_table(sys);
                start_main_loop_timer(sys);
            });
    },
    sys.update_timeout);
}

function increase_spread(sys)
{
    $('#options>tbody>tr').each(function(i, row){
        Object.keys(row.cells).forEach(function(j){
            var cell = $(row.cells[j]);
            var o = cell[0].option;

            if (cell.hasClass('highlighted1')) {
                var v = o.bspread + o.underlying.adjustment;
                if (v > 0)
                    o.bspread = v;
            }
            else if (cell.hasClass('highlighted2')) {
                var v = o.aspread + o.underlying.adjustment;
                if (v > 0)
                    o.aspread = v;
            }
        });
    });

    refresh_table(sys);
}

function decrease_spread(sys)
{
    $('#options>tbody>tr').each(function(i, row){
        Object.keys(row.cells).forEach(function(j){
            var cell = $(row.cells[j]);
            var o = cell[0].option;

            if (cell.hasClass('highlighted1')) {
                var v = o.bspread - o.underlying.adjustment;
                if (v > 0)
                    o.bspread = v;
            }
            else if (cell.hasClass('highlighted2')) {
                var v = o.aspread - o.underlying.adjustment;
                if (v > 0)
                    o.aspread = v;
            }
        });
    });

    refresh_table(sys);
}

function show_alert(sys, msg, err)
{
    var elem = $('#alert-div');
    
    if (!elem.hasClass('show'))
    {
        $('#alert-div-text').text(msg);

        if (err)
        {
            elem.removeClass('alert-success');
            elem.addClass('alert-danger');
            console.log(elem);
        }
        else
        {
            elem.removeClass('alert-danger');
            elem.addClass('alert-success');
        }
        elem.addClass('show');
        setTimeout(function(){ elem.removeClass('show'); }, 1000);
    }
}

function apply_changes(sys)
{
    if (sys.selected_count['bid'] == 0 && sys.selected_count['ask'] == 0)
        return;

    var changes = 0;
    var obj = {'ukey' : sys.selected_name.ukey, 'options' : []};

    $('#options>tbody>tr').each(function(i, row){
        Object.keys(row.cells).forEach(function(j){
            var name = columns[j];
            var cell = $(row.cells[j]);
            var o = cell[0].option;

            if (cell.hasClass('highlighted1')) {
                obj['options'].push({'ukey' : o.ukey, 'bspread' : o.bspread});
                cell.removeClass('highlighted1');
                
                if (o.bspread != o.default_bspread)
                {
                    changes += 1;
                    o.default_bspread = o.bspread;
                }
            }
            else if (name == "aspread" && cell.hasClass('highlighted2')) {
                obj['options'].push({'ukey' : o.ukey, 'aspread' : o.aspread});
                cell.removeClass('highlighted2');
                
                if (o.aspread != o.default_aspread)
                {
                    changes += 1;
                    o.default_aspread = o.aspread;
                }               
            }
        });
    });
    sys.selected_count['bid'] = sys.selected_count['ask'] = 0;
    refresh_table(sys);

    if (changes > 0)
    {
        var o = JSON.stringify(obj);
        trace(sys, "sending: " + o);
        queue_fetch(sys, "query.php?cmd=apply&data=" + o, function(sys, data)
        {
            trace(sys, "received: " + data);
            show_alert(sys, "Changes applied successuflly!", false);
        });
    }
    else
    {
        show_alert(sys, "No changes applied!", true);
    }
}

function discard_changes(sys)
{
    trace(sys, 'discard changes');

    $('#options>tbody>tr').each(function(i, row){
        Object.keys(row.cells).forEach(function(j){
            var cell = $(row.cells[j]);
            cell.removeClass('highlighted1');
            cell.removeClass('highlighted2');
        });
    });
    sys.selected_count['bid'] = sys.selected_count['ask'] = 0;

    sys.selected_name.options.forEach(function(o){
        o.bspread = o.default_bspread;
        o.aspread = o.default_aspread;
    });
    refresh_table(sys);
}

function select_expiry(sys, i, j)
{
    sys.selected_name = sys.names[i];
    sys.selected_exp = sys.selected_name.expiries[j];
    trace(sys, "selected " + sys.selected_name.name + "/" + sys.selected_exp);
    
    sys.table_init_done = false;
    initialize_table(sys);
}

function select_name(sys, i, j)
{
    $('#name' + i).addClass('in active');        
    $('#expiries' + i + ' li:eq(' + j + ') a').tab('show');
    $('#expiries' + i + ' a').on('shown.bs.tab', function(event){
        var current = $(event.target).closest('li').index();
        select_expiry(sys, i, current);
    });
    select_expiry(sys, i, j);
    // load adjustment
    $('#adjustment').val(sys.names[i].adjustment);
    // load config
    $('#apply_to_all_exp').prop('checked', sys.names[i].apply_all_expiries);
}

function load_data(sys, data)
{
    for (var i in data) {
        Object.keys(data[i]).forEach(function(name){
            var u = new underlying(name, data[i][name]['ukey']);
            sys.names.push(u);
            sys.names_map[u.ukey] = u;
            Object.keys(data[i][name]['expiries']).forEach(function(exp){
                var exp_data = data[i][name]['expiries'][exp];
                u.expiries.push(exp);
                for (var j in exp_data) {
                    var elem = exp_data[j];
                    var o = new option(u, exp, elem['ukey'], elem['strike'], elem['cp']);
                    u.options.push(o);
                    u.options_map[o.ukey] = o;
                }
            });
        });
    }
}

function update_data(sys, data)
{
    for (var i in data) {
        var e = data[i];
        var u = sys.names_map[e['ukey']];
        
        e['options'].forEach(function(oe){
            var o = u.options_map[oe['ukey']];
            o.default_bspread = oe['bspread'];
            o.default_aspread = oe['aspread'];
            o.bs = oe['bs'];
            o.pos = oe['pos'];
            if (o.bspread == 0)
                o.bspread = o.default_bspread;
            if (o.aspread == 0)
                o.aspread = o.default_aspread;
        });
    }
}

function option(u, expiry, ukey, s, cp)
{
    this.underlying = u;
    this.expiry = expiry;
    this.ukey = ukey;
    this.strike = s;
    this.cp = cp;
    this.nanny = "";
    this.bs = 0.0;
    this.pos = 0;

    this.bspread = 0.0;
    this.default_bspread = 0.0;
    this.aspread = 0.0;
    this.default_aspread = 0.0;   
}

function underlying(name, ukey)
{
    this.name = name;
    this.ukey = ukey;
    this.expiries = [];
    this.options = [];
    this.options_map = {};

    this.adjustment = parseFloat(try_get_local_value(name + '_adjustment', 0.01))
    this.apply_all_expiries = (try_get_local_value(name + '_apply_all_expiries', false) == 'true');
}

function grid_system()
{
  var _this = this;
  this.enable_trace = true;
  this.data = null;
  this.names = [];
  this.names_map = {};

  this.selected_name = null;
  this.selected_exp = null;

  this.update_timeout = 2000;
  this.main_loop_timer = null;
  this.update_in_progress = false;
  this.pending_updates = []

  this.table_container = $('div#table-container');
  this.table_container.html('');
  this.table_container.append(this.table = $('<table id="options" class="table table-bordered table-fit">'));
  this.table.append(this.table_head = $('<thead class="thead-light">'));
  this.table.append(this.table_body = $('<tbody>'));
  this.table_head.append(this.upper_title_row = $('<tr/>'));
  this.table_init_done = false;

  this.is_mousedown = false;
  this.selected_count = { 'bid' : 0, 'ask' : 0 };
  
  // create headers
  columns.forEach(function(i)
  {
      var ch = $('<th style="width: 10%" class="bg-info" />');
      ch.text(i);
      _this.upper_title_row.append(ch);
  });
}

function setup_system()
{
  var sys = new grid_system();
  
  queue_fetch(
    sys,
    "query.php?cmd=init",
    function(sys, data)
    {
        load_data(sys, data);
        initialize_view(sys);
        start_main_loop_timer(sys);
    });
}

                // div1 = $('<div class="pull-left"/>');
                // div1.append(btn1 = $('<input type="button" style="width: 50px;" class="btn btn-success" value="+" />'));
                // div2 = $('<div class="pull-right"/>');
                // div2.append(btn2 = $('<input type="button" style="width: 50px;" class="btn btn-danger" value="-" />'));
                // cell.append(div1);
                // cell.append(div2);

                // btn1.click(function(event){
                //     console.log("+++");
                // });
                // btn2.click(function(event){
                //     console.log("---");
                // });

                // cell.addClass('strike');
                // cell[0].is_selected = false;
                // cell.click(function(){
                //     var cell = $(this);
                //     cell[0].is_selected = !cell[0].is_selected;
                //     if (cell[0].is_selected)
                //     {
                //         cell.removeClass('strike');
                //         cell.addClass('strike-selected');
                //     }
                //     else
                //     {
                //         cell.removeClass('strike-selected');
                //         cell.addClass('strike');
                //     }
                // });
                // cell.click(function(){
                //     var cell = $(this);
                //     o.aspread += o.underlying.adjustment;
                //     update_cell(o.aspread, o.default_aspread, cell);
                // });
                // cell.contextmenu(function(e){
                //     e.preventDefault();
                //     var cell = $(this);
                //     if (o.aspread > o.underlying.adjustment) {
                //         o.aspread -= o.underlying.adjustment;
                //         update_cell(o.aspread, o.default_aspread, cell);
                //     }
                //     return false;
                // });
                