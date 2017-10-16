/**
 * Resource tests
 */

var Koa = require('koa')
  , http = require('http')
  , request = require('supertest')
  , Resource = require('../lib/resource')
  , should = require('should');

describe('Resource', function() {
  it('creates new resource', function(done) {
    var resource = new Resource('forums', {
      index: async () => {},
      show: async () => {}
    });
    resource.should.be.have.type('object');
    resource.should.have.property('name', 'forums');
    resource.should.have.property('id', 'forum');
    resource.should.have.property('routes');
    resource.routes.should.be.an.instanceOf(Array);
    resource.routes.should.have.property(0);
    resource.routes.should.have.property(1);
    resource.routes[0].should.have.property('url', '/forums');
    resource.routes[1].should.have.property('url', '/forums/:forum');
    done();
  });

  it('ignores unsupported action object properties', function(done) {
    var app = new Koa();

    var users = new Resource('users', {
      invalid: true,
      show: async (ctx) => {
        ctx.status = 200;
      }
    });

    app.use(users.middleware());

    request(http.createServer(app.callback()))
      .get('/users/123')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        done();
      });
  });

  it('maps "new" and "show" routes correctly', function(done) {
    var app = new Koa();

    (function firstOrder(next) {
      var users = new Resource('users', {
        'new': async (ctx) => {
          ctx.status = 500;
        },
        show: async (ctx) => {
          ctx.status = 200;
        }
      });

      users.base.should.equal('/users');
      app.use(users.middleware());

      request(http.createServer(app.callback()))
        .get('/users/test')
        .expect(200)
        .end(function(err, res) {
          if (err) return next(err);

          request(http.createServer(app.callback()))
            .get('/users/new')
            .expect(500)
            .end(function(err, res) {
              if (err) return next(err);
              next(null, done);
            });
        });
    })(reverseOrder);

    function reverseOrder(err, done) {
      if (err) return done(err);

      var users = new Resource('users', {
        show: async (ctx) => {
          ctx.status = 200;
        },
        'new': async (ctx) => {
          ctx.status = 500;
        }
      });

      users.base.should.equal('/users');
      app.use(users.middleware());

      request(http.createServer(app.callback()))
        .get('/users/new')
        .expect(500)
        .end(function(err, res) {
          if (err) return done(err);

          request(http.createServer(app.callback()))
            .get('/users/test')
            .expect(200)
            .end(function(err, res) {
              if (err) return done(err);
              done();
            });
        });
    };

  });

  it('nests resources', function(done) {
    var app = new Koa();
    var forums = new Resource('forums', {
      index: async () => {}
    });
    var threads = new Resource('threads', {
      index: async () => {},
      show: async (ctx) => {
        should.exist(ctx.params);
        ctx.params.should.have.property('forum', '54');
        ctx.params.should.have.property('thread', '12');
        ctx.status = 200;
      }
    });
    forums.add(threads);
    threads.base.should.equal('/forums/:forum/threads');
    app.use(threads.middleware());
    request(http.createServer(app.callback()))
      .get('/forums/54/threads/12')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        done();
      });
  });

  it('options.methods overrides action methods', function(done) {
    var app = new Koa();
    app.use(Resource('users', {
      update: async (ctx) => {
        ctx.status = 200;
      }
    }, {
      methods: {
        update: 'PATCH'
      }
    }).middleware());
    request(http.createServer(app.callback()))
      .patch('/users/123')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        done();
      });
  });

  it('options.id overrides id parameter name', function(done) {
    var app = new Koa();
    app.use(Resource('users', {
      show: async (ctx) => {
        should.exist(ctx.params);
        ctx.params.should.have.property('user_id', '123');
        ctx.status = 200;
      }
    }, {
      id: "user_id"
    }).middleware());
    request(http.createServer(app.callback()))
      .get('/users/123')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        done();
      });
  });

  it('composes both global and per function middleware', function(done) {
    var app = new Koa();

    var preRequestMiddleware = async (ctx, next) =>{
      ctx.status = 200;
      ctx.body = 'firstMiddleware';
      await next();
    };

    var actions = {
      show: [
        async (ctx) => {
          ctx.body += '|secondMiddleware';
        }, 
        async () => {
          
        }
      ]
    };

    var resource = Resource('users', preRequestMiddleware, actions);

    app.use(resource.middleware());

    request(http.createServer(app.callback()))
      .get('/users/1')
      .expect(200, "firstMiddleware|secondMiddleware")
      .end(done);
  });

  it('composes resource middleware for each action, even with a custom id param name', function(done) {
    var app = new Koa();

    var preRequestMiddleware = async (ctx, next) => {
      ctx.status = 200;
      await next();
    };

    var actions = {
      show: async (ctx) => {
        ctx.params.should.have.property('user_id', '1');
        ctx.body = "yo";
      }
    };

    var options = {
      id: "user_id"
    };

    var resource = Resource('users', preRequestMiddleware, actions, options);

    app.use(resource.middleware());

    request(http.createServer(app.callback()))
      .get('/users/1')
      .expect(200, "yo")
      .end(done);
  });

  it('routes top-level resource', function(done) {
    var app = new Koa();
    app.use(Resource({
      index: async (ctx) => {
        ctx.status = 200;
      }
    }).middleware());
    request(http.createServer(app.callback()))
      .get('/')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        done();
      });
  });

  it('ignores query string', function(done) {
    var app = new Koa();
    app.use(Resource('users', {
      index: async (ctx) => {
        ctx.status = 200;
      }
    }).middleware());
    request(http.createServer(app.callback()))
      .get('/users?foo')
      .expect(200)
      .end(done);
  });

  it('responds to OPTIONS', function(done) {
    var app = new Koa();
    app.use(Resource('users', {
      index: async (ctx) => {
        ctx.status = 200;
      },
      read: async (ctx) => {
        ctx.body = 'yo'
      },
      update: async (ctx) => {
        ctx.body = 'yo'
      }
    }).middleware());
    request(http.createServer(app.callback()))
      .options('/users/1')
      .expect(204)
      .expect('Allow', 'GET, PUT')
      .end(done);
  });

  it('composes resource middleware for each action', function(done) {
    var app = new Koa();

    app.use(Resource('users', async (ctx, next) => {
      ctx.status = 200;
    }, {
      show: async (ctx) => {
        ctx.body = 'yo';
      }
    }).middleware());

    request(http.createServer(app.callback()))
      .get('/users/1')
      .expect(200)
      .end(done);
  });

  it('doesn\'t call multiple controller actions', function(done) {
    var app = new Koa();
    var counter = 0;
    const increaseCounter = async (ctx) => {
      counter++;
      ctx.status = 204;
    };
    app.use(Resource('threads', {
      index: increaseCounter,
      new: increaseCounter,
      create: increaseCounter,
      show: increaseCounter,
      edit: increaseCounter,
      update: increaseCounter,
      destroy: increaseCounter,
    }).middleware());
    var server = http.createServer(app.callback());
    request(server)
    .get('/threads')
    .expect(204)
    .end(function(err, res) {
      if (err) return done(err);
      request(server)
      .get('/threads/new')
      .expect(204)
      .end(function(err, res) {
        if (err) return done(err);
        request(server)
        .post('/threads')
        .expect(204)
        .end(function(err, res) {
          if (err) return done(err);
          request(server)
          .get('/threads/1234')
          .expect(204)
          .end(function(err, res) {
            if (err) return done(err);
            request(server)
            .get('/threads/1234/edit')
            .expect(204)
            .end(function(err, res) {
              if (err) return done(err);
              request(server)
              .put('/threads/1234')
              .expect(204)
              .end(function(err, res) {
                if (err) return done(err);
                request(server)
                .get('/threads/1234')
                .expect(204)
                .end(function(err, res) {
                  if (err) return done(err);
                  counter.should.equal(7);
                  done();
                });
              });
            });
          });
        });
      });
    });
  });
});
