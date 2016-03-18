/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var common = require('./common.js');

var traceLabels = require('../../lib/trace-labels.js');
var http = require('http');
var assert = require('assert');

var server;

var versions = {
  hapi8: require('./fixtures/hapi8'),
  hapi9: require('./fixtures/hapi9'),
  hapi10: require('./fixtures/hapi10')
};

Object.keys(versions).forEach(function(version) {
  var hapi = versions[version];
  describe(version, function() {
    afterEach(function(done) {
      common.cleanTraces();
      server.stop(done);
    });

    it('should accurately measure get time, get', function(done) {
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.route({
        method: 'GET',
        path: '/',
        handler: function(req, reply) {
          setTimeout(function() {
            reply(common.serverRes);
          }, common.serverWait);
        }
      });
      server.start(function() {
        common.doRequest('GET', done, hapiPredicate);
      });
    });

    it('should accurately measure get time, post', function(done) {
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.route({
        method: 'POST',
        path: '/',
        handler: function(req, reply) {
          setTimeout(function() {
            reply(common.serverRes);
          }, common.serverWait);
        }
      });
      server.start(function() {
        common.doRequest('POST', done, hapiPredicate);
      });
    });

    it('should accurately measure get time, custom handlers', function(done) {
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.handler('custom', function(route, options) {
        return function(requeset, reply) {
          setTimeout(function() {
            reply(options.val);
          }, common.serverWait);
        };
      });
      server.route({
        method: 'GET',
        path: '/',
        handler: { custom: { val: common.serverRes } }
      });
      server.start(function() {
        common.doRequest('GET', done, hapiPredicate);
      });
    });

    it('should accurately measure get time, custom plugin', function(done) {
      var plugin = function(server, options, next) {
        server.route({
          method: 'GET',
          path: '/',
          handler: function(req, reply) {
            setTimeout(function() {
              reply(common.serverRes);
            }, common.serverWait);
          }
        });
        return next();
      };
      plugin.attributes = {
        name: 'plugin',
        version: '1.0.0'
      };
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.register({
        register: plugin,
        options : {}
      }, function(err) {
        assert(!err);
        server.start(function() {
          common.doRequest('GET', done, hapiPredicate);
        });
      });
    });

    it('should accurately measure get time, after + get', function(done) {
      var afterSuccess = false;
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.after(function(server, next) {
        afterSuccess = true;
        next();
      });
      server.route({
        method: 'GET',
        path: '/',
        handler: function(req, reply) {
          setTimeout(function() {
            reply(common.serverRes);
          }, common.serverWait);
        }
      });
      server.start(function() {
        assert(afterSuccess);
        common.doRequest('GET', done, hapiPredicate);
      });
    });

    it('should accurately measure get time, extension + get', function(done) {
      var extensionSuccess = false;
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.ext('onRequest', function(request, reply) {
        setTimeout(function() {
          extensionSuccess = true;
          return reply.continue();
        }, common.serverWait / 2);
      });
      server.route({
        method: 'GET',
        path: '/',
        handler: function(req, reply) {
          setTimeout(function() {
            reply(common.serverRes);
          }, common.serverWait / 2);
        }
      });
      server.start(function() {
        var cb = function() {
          assert(extensionSuccess);
          done();
        };
        common.doRequest('GET', cb, hapiPredicate);
      });
    });

    it('should have proper labels', function(done) {
      server = new hapi.Server();
      server.connection({ port: common.serverPort });
      server.route({
        method: 'GET',
        path: '/',
        handler: function(req, reply) {
          reply(common.serverRes);
        }
      });
      server.start(function() {
        http.get({port: common.serverPort}, function(res) {
          var labels = common.getMatchingSpan(hapiPredicate).labels;
          assert.equal(labels[traceLabels.HTTP_RESPONSE_CODE_LABEL_KEY], '200');
          assert.equal(labels[traceLabels.HTTP_METHOD_LABEL_KEY], 'GET');
          assert.equal(labels[traceLabels.HTTP_URL_LABEL_KEY], 'http://localhost:9042/');
          assert(labels[traceLabels.HTTP_SOURCE_IP]);
          done();
        });
      });
    });
  });
});

function hapiPredicate(span) {
  return span.name === '/';
}
