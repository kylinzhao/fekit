// Generated by CoffeeScript 1.4.0
(function() {
  var ACTION, do_actions, exjson, get_actions, helper_mockjson, noop, request, urlparser, util, utils, vm;

  request = require('request');

  urlparser = require('url');

  vm = require('vm');

  utils = require("../util");

  util = require("util");

  helper_mockjson = require("./helper_mockjson");

  /*
  启动 fekit server 时，可以通过读取配置，进行不同的mock处理
  如: fekit server -m ~/myurl.conf
  
  mock.json是一个针对域名作的代理服务配置文件,内容为
  
      module.exports = {
          * key 可以是正则表达式, 也可以是字符串（但仍然会转为正则表达式执行）
          * value 以不同的配置，进行不同的操作，具体见 ACTION
          * 默认的 value 是string, uri以后缀名或内容判断 ACTION
              .json -> raw
              .js   -> action
              .mockjson -> mockjson
              包含 http:// 或 https://  -> proxy_pass
      }
  */


  module.exports = function(options) {
    var mock_file;
    if (!(options.mock || utils.path.exists(options.mock))) {
      return noop;
    }
    mock_file = utils.file.io.readbymtime(options.mock);
    return function(req, res, next) {
      var actions, key, n, result, sandbox, url, _ref;
      sandbox = {
        module: {
          exports: {}
        }
      };
      try {
        vm.runInNewContext(exjson(mock_file()), sandbox);
      } catch (err) {
        sandbox.module.exports = {};
      }
      url = req.url;
      _ref = sandbox.module.exports;
      for (key in _ref) {
        actions = _ref[key];
        n = key.split("^^^");
        key = new RegExp(n[0], n[1]);
        result = url.match(key);
        if (result) {
          return do_actions(result, actions, req, res, next);
        }
      }
      return next();
    };
  };

  do_actions = function(result, actions, req, res, next) {
    var action_config, action_key, context, i, jobs;
    actions = (function() {
      switch (false) {
        case typeof actions !== 'string':
          return get_actions(actions);
        case !util.isArray(actions):
          return utils.extend({}, (function() {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = actions.length; _i < _len; _i++) {
              i = actions[_i];
              _results.push(get_actions(i));
            }
            return _results;
          })());
        default:
          return actions;
      }
    })();
    jobs = (function() {
      var _results;
      _results = [];
      for (action_key in actions) {
        action_config = actions[action_key];
        if (ACTION[action_key]) {
          _results.push({
            action: ACTION[action_key],
            user_config: action_config
          });
        }
      }
      return _results;
    })();
    context = {
      req: req,
      res: res,
      result: result
    };
    return utils.async.series(jobs, function(item, done) {
      return item.action(item.user_config, context, done);
    }, function(err) {
      if (err) {
        utils.logger.error(err);
        return res.end(err);
      } else {
        return res.end();
      }
    });
  };

  ACTION = {
    /*
            配置案例
            proxy_pass : 'http://l-hslist.corp.qunar.com'
    */

    "proxy_pass": function(user_config, context, done) {
      var conf, proxy_option, r, req;
      conf = {
        url: '',
        set_header: {}
      };
      if (typeof user_config === 'string') {
        conf.url = user_config;
      }
      conf.urlObject = urlparser.parse(conf.url);
      proxy_option = {
        url: '',
        headers: {}
      };
      req = context.req;
      proxy_option.url = urlparser.format(utils.extend({}, conf.urlObject, urlparser.parse(req.url)));
      proxy_option.headers = utils._.extend({}, req.headers, {
        host: conf.urlObject.host
      }, conf.set_header);
      switch (req.method) {
        case 'GET':
          r = request.get(proxy_option).pipe(context.res);
          break;
        case 'POST':
          r = request.post(proxy_option).pipe(context.res);
      }
      return r.on('end', function() {
        return done();
      });
    },
    /*
            配置案例
            "raw" : "./url.json"
    */

    "raw": function(user_config, context, done) {
      context.res.setHeader("Content-Type", "application/json");
      context.res.write(utils.file.io.read(user_config));
      return done();
    },
    /*
            配置案例
            "action" : "./url.js"
    
            在 url.js 中，必须存在 
            module.exports = function( req , res , user_config , context ) {
                // res.write("hello");
            }
    */

    "action": function(user_config, context, done) {
      var act_file, sandbox, _base;
      act_file = utils.file.io.read(user_config);
      sandbox = {
        module: {
          exports: noop
        }
      };
      vm.runInNewContext(act_file, sandbox);
      if (typeof (_base = sandbox.module).exports === "function") {
        _base.exports(context.req, context.res, user_config, context);
      }
      return done();
    },
    /*
            配置案例
            "mockjson" : "./a.mockjson"
    
            使用方式见：https://github.com/mennovanslooten/mockJSON
    */

    "mockjson": function(user_config, context, done) {
      var json;
      json = utils.file.io.readJSON(user_config);
      context.res.setHeader("Content-Type", "application/json");
      context.res.write(JSON.stringify(helper_mockjson.mockJSON.generateFromTemplate(json)));
      return done();
    }
  };

  noop = function(req, res, next) {
    return next();
  };

  exjson = function(txt) {
    var count, def;
    def = "";
    count = 0;
    return txt.replace(new RegExp("/(\\\\/|.*?)/([ig]*)(.*?:)", "ig"), function($0, $1, $2, $3) {
      return util.inspect($1 + "^^^" + $2) + $3;
    });
  };

  get_actions = function(actions) {
    switch (false) {
      case !(actions.indexOf('http://') > -1 || actions.indexOf('https://') > -1):
        return {
          proxy_pass: actions
        };
      case utils.path.extname(actions) !== ".mockjson":
        return {
          mockjson: actions
        };
      case utils.path.extname(actions) !== ".json":
        return {
          raw: actions
        };
      case utils.path.extname(actions) !== ".js":
        return {
          action: actions
        };
    }
  };

}).call(this);
