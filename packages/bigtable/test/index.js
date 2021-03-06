/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

var assert = require('assert');
var extend = require('extend');
var format = require('string-format-obj');
var googleProtoFiles = require('google-proto-files');
var nodeutil = require('util');
var proxyquire = require('proxyquire');
var sinon = require('sinon').sandbox.create();

var GrpcService = require('@google-cloud/common').GrpcService;
var PKG = require('../package.json');
var Table = require('../src/table.js');
var util = require('@google-cloud/common').util;

var fakeUtil = extend({}, util);

function FakeGrpcService() {
  this.calledWith_ = arguments;
  GrpcService.apply(this, arguments);
}

nodeutil.inherits(FakeGrpcService, GrpcService);

function FakeTable() {
  this.calledWith_ = arguments;
  Table.apply(this, arguments);
}

function FakeFamily() {}

describe('Bigtable', function() {
  var PROJECT_ID = 'test-project';
  var ZONE = 'test-zone';
  var CLUSTER = 'test-cluster';

  var CLUSTER_NAME = format('projects/{p}/zones/{z}/clusters/{c}', {
    p: PROJECT_ID,
    z: ZONE,
    c: CLUSTER
  });

  var Bigtable;
  var bigtable;

  before(function() {
    Bigtable = proxyquire('../', {
      '@google-cloud/common': {
        GrpcService: FakeGrpcService,
        util: fakeUtil
      },
      './family.js': FakeFamily,
      './table.js': FakeTable
    });
  });

  afterEach(function() {
    sinon.restore();
  });

  beforeEach(function() {
    bigtable = new Bigtable({
      projectId: PROJECT_ID,
      zone: ZONE,
      cluster: CLUSTER
    });
  });

  describe('instantiation', function() {
    it('should normalize the arguments', function() {
      var normalizeArguments = fakeUtil.normalizeArguments;
      var normalizeArgumentsCalled = false;
      var fakeOptions = {
        projectId: PROJECT_ID,
        zone: ZONE,
        cluster: CLUSTER
      };
      var fakeContext = {};

      fakeUtil.normalizeArguments = function(context, options) {
        normalizeArgumentsCalled = true;
        assert.strictEqual(context, fakeContext);
        assert.strictEqual(options, fakeOptions);
        return options;
      };

      Bigtable.call(fakeContext, fakeOptions);
      assert(normalizeArgumentsCalled);

      fakeUtil.normalizeArguments = normalizeArguments;
    });

    it('should throw if a cluster is not provided', function() {
      assert.throws(function() {
        new Bigtable({});
      }, /A cluster must be provided to interact with Bigtable\./);
    });

    it('should throw if a zone is not provided', function() {
      assert.throws(function() {
        new Bigtable({
          cluster: CLUSTER
        });
      }, /A zone must be provided to interact with Bigtable\./);
    });

    it('should leave the original options unaltered', function() {
      var fakeOptions = {
        a: 'a',
        b: 'b',
        c: 'c',
        cluster: CLUSTER,
        zone: ZONE
      };

      var bigtable = new Bigtable(fakeOptions);
      var options = bigtable.calledWith_[1];

      for (var option in fakeOptions) {
        assert.strictEqual(fakeOptions[option], options[option]);
      }

      assert.notStrictEqual(fakeOptions, options);
    });

    it('should localize the cluster name', function() {
      assert.strictEqual(bigtable.clusterName, CLUSTER_NAME);
    });

    it('should inherit from GrpcService', function() {
      assert(bigtable instanceof GrpcService);

      var calledWith = bigtable.calledWith_[0];

      assert.strictEqual(calledWith.baseUrl, 'bigtable.googleapis.com');
      assert.strictEqual(calledWith.service, 'bigtable');
      assert.strictEqual(calledWith.apiVersion, 'v1');

      assert.deepEqual(calledWith.protoServices, {
        BigtableService: googleProtoFiles.bigtable.v1,
        BigtableTableService: {
          path: googleProtoFiles.bigtable.admin,
          service: 'bigtable.admin.table'
        }
      });

      assert.deepEqual(calledWith.scopes, [
        'https://www.googleapis.com/auth/bigtable.admin',
        'https://www.googleapis.com/auth/bigtable.data'
      ]);
      assert.strictEqual(calledWith.userAgent, PKG.name + '/' + PKG.version);
    });
  });

  describe('formatTableName_', function() {
    it('should return the last section of a formatted table name', function() {
      var fakeTableName = 'projects/p/zones/z/clusters/c/tables/my-table';
      var formatted = Bigtable.formatTableName_(fakeTableName);

      assert.strictEqual(formatted, 'my-table');
    });

    it('should do nothing if the table is name is not formatted', function() {
      var fakeTableName = 'my-table';
      var formatted = Bigtable.formatTableName_(fakeTableName);

      assert.strictEqual(formatted, fakeTableName);
    });
  });

  describe('createTable', function() {
    var TABLE_ID = 'my-table';

    it('should throw if a name is not provided', function() {
      assert.throws(function() {
        bigtable.createTable();
      }, /A name is required to create a table\./);
    });

    it('should provide the proper request options', function(done) {
      bigtable.request = function(protoOpts, reqOpts) {
        assert.deepEqual(protoOpts, {
          service: 'BigtableTableService',
          method: 'createTable'
        });

        assert.strictEqual(reqOpts.name, CLUSTER_NAME);
        assert.strictEqual(reqOpts.tableId, TABLE_ID);
        assert.deepEqual(reqOpts.table, {
          granularity: 0
        });
        done();
      };

      bigtable.createTable(TABLE_ID, assert.ifError);
    });

    it('should set the current operation', function(done) {
      var options = {
        operation: 'abc'
      };

      bigtable.request = function(protoOpts, reqOpts) {
        assert.strictEqual(reqOpts.table.currentOperation, options.operation);
        done();
      };

      bigtable.createTable(TABLE_ID, options, assert.ifError);
    });

    it('should set the initial split keys', function(done) {
      var options = {
        splits: ['a', 'b']
      };

      bigtable.request = function(protoOpts, reqOpts) {
        assert.strictEqual(reqOpts.initialSplitKeys, options.splits);
        done();
      };

      bigtable.createTable(TABLE_ID, options, assert.ifError);
    });

    describe('creating column families', function() {
      it('should accept a family name', function(done) {
        var options = {
          families: ['a', 'b']
        };

        bigtable.request = function(protoOpts, reqOpts) {
          assert.deepEqual(reqOpts.table.columnFamilies, {
            a: {},
            b: {}
          });

          done();
        };

        bigtable.createTable(TABLE_ID, options, assert.ifError);
      });

      it('should accept a garbage collection expression', function(done) {
        var options = {
          families: [
            {
              name: 'c',
              rule: 'd'
            }
          ]
        };

        bigtable.request = function(protoOpts, reqOpts) {
          assert.deepEqual(reqOpts.table.columnFamilies, {
            c: {
              gcExpression: 'd'
            }
          });
          done();
        };

        bigtable.createTable(TABLE_ID, options, assert.ifError);
      });

      it('should accept a garbage collection object', function(done) {
        var options = {
          families: [
            {
              name: 'e',
              rule: {}
            }
          ]
        };

        var fakeRule = { a: 'b' };

        FakeFamily.formatRule_ = function(rule) {
          assert.strictEqual(rule, options.families[0].rule);
          return fakeRule;
        };

        bigtable.request = function(protoOpts, reqOpts) {
          assert.deepEqual(reqOpts.table.columnFamilies, {
            e: {
              gcRule: fakeRule
            }
          });
          done();
        };

        bigtable.createTable(TABLE_ID, options, assert.ifError);
      });
    });

    it('should return an error to the callback', function(done) {
      var err = new Error('err');
      var response = {};

      bigtable.request = function(protoOpts, reqOpts, callback) {
        callback(err, response);
      };

      bigtable.createTable(TABLE_ID, function(err_, table, apiResponse) {
        assert.strictEqual(err, err_);
        assert.strictEqual(table, null);
        assert.strictEqual(apiResponse, response);
        done();
      });
    });

    it('should return a Table object', function(done) {
      var response = {
        name: TABLE_ID
      };

      var fakeTable = {};

      var tableSpy = sinon.stub(bigtable, 'table', function() {
        return fakeTable;
      });

      bigtable.request = function(p, r, callback) {
        callback(null, response);
      };

      bigtable.createTable(TABLE_ID, function(err, table, apiResponse) {
        assert.ifError(err);
        assert.strictEqual(table, fakeTable);
        assert(tableSpy.calledWithExactly(response.name));
        assert.strictEqual(table.metadata, response);
        assert.strictEqual(response, apiResponse);
        done();
      });
    });
  });

  describe('getTables', function() {
    it('should provide the proper request options', function(done) {
      bigtable.request = function(protoOpts, reqOpts) {
        assert.deepEqual(protoOpts, {
          service: 'BigtableTableService',
          method: 'listTables'
        });
        assert.strictEqual(reqOpts.name, CLUSTER_NAME);
        done();
      };

      bigtable.getTables(assert.ifError);
    });

    it('should return an error to the callback', function(done) {
      var err = new Error('err');
      var response = {};

      bigtable.request = function(p, r, callback) {
        callback(err, response);
      };

      bigtable.getTables(function(err_, tables, apiResponse) {
        assert.strictEqual(err, err_);
        assert.strictEqual(tables, null);
        assert.strictEqual(apiResponse, response);
        done();
      });
    });

    it('should return a list of Table objects', function(done) {
      var fakeFormattedName = 'abcd';
      var response = {
        tables: [{
          name: 'projects/p/zones/z/clusters/c/tables/my-table'
        }]
      };
      var fakeTable = {};

      bigtable.request = function(p, r, callback) {
        callback(null, response);
      };

      var tableSpy = sinon.stub(bigtable, 'table', function() {
        return fakeTable;
      });

      var formatSpy = sinon.stub(Bigtable, 'formatTableName_', function() {
        return fakeFormattedName;
      });

      bigtable.getTables(function(err, tables, apiResponse) {
        assert.ifError(err);

        var table = tables[0];

        assert.strictEqual(table, fakeTable);
        assert(formatSpy.calledWithExactly(response.tables[0].name));
        assert(tableSpy.calledWithExactly(fakeFormattedName));
        assert.strictEqual(table.metadata, response.tables[0]);
        assert.strictEqual(response, apiResponse);
        done();
      });
    });
  });

  describe('table', function() {
    var TABLE_ID = 'table-id';

    it('should return a table instance', function() {
      var table = bigtable.table(TABLE_ID);
      var args = table.calledWith_;

      assert(table instanceof FakeTable);
      assert.strictEqual(args[0], bigtable);
      assert.strictEqual(args[1], TABLE_ID);
    });
  });

});
