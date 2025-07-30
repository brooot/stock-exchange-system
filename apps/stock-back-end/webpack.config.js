const { join } = require('path');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'node',
  entry: './src/main.ts',
  output: {
    path: join(__dirname, '../../dist/apps/stock-back-end'),
    filename: 'main.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: [
    nodeExternals({
      additionalModuleDirs: ['../../node_modules'],
      modulesFromFile: false,
      importType: 'commonjs',
      allowlist: [
        // 打包核心 NestJS 模块，但排除微服务相关
        /^@nestjs\/common/,
        /^@nestjs\/core/,
        /^@nestjs\/platform-express/,
        /^@nestjs\/platform-socket\.io/,
        /^@nestjs\/websockets/,
        /^@nestjs\/swagger/,
        /^@nestjs\/config/,
        /^@nestjs\/jwt/,
        /^@nestjs\/passport/,
        /^@nestjs\/throttler/,
        /^@nestjs\/serve-static/,
        /^@nestjs\/schedule/,
        /^@nestjs\/event-emitter/,
        /^@nestjs\/cache-manager/,
        /^@nestjs\/bull/,
        /^@nestjs\/testing/,
        // Passport 相关模块
        /^passport/,
        /^passport-jwt/,
        /^passport-local/,
        /^passport-strategy/,
        // 打包 Prisma 相关模块
        /^@prisma\//,
        /^class-validator/,
        /^class-transformer/,
        /^reflect-metadata/,
        /^rxjs/,
        /^tslib/,
        // Express 相关模块
        /^express/,
        /^cookie-parser/,
        // Socket.io 相关模块
        /^socket\.io/,
        // 其他核心依赖
        /^axios/,
        /^decimal\.js/
      ]
    }),
    // 明确外部化数据库、微服务和原生模块
    {
      // 数据库相关
      'pg': 'commonjs pg',
      'pg-native': 'commonjs pg-native',
      'sqlite3': 'commonjs sqlite3',
      'mysql2': 'commonjs mysql2',
      'mysql': 'commonjs mysql',
      'oracledb': 'commonjs oracledb',
      'tedious': 'commonjs tedious',
      'pg-query-stream': 'commonjs pg-query-stream',
      // 微服务相关
      '@nestjs/microservices': 'commonjs @nestjs/microservices',
      'ioredis': 'commonjs ioredis',
      'amqplib': 'commonjs amqplib',
      'amqp-connection-manager': 'commonjs amqp-connection-manager',
      'nats': 'commonjs nats',
      'mqtt': 'commonjs mqtt',
      'kafkajs': 'commonjs kafkajs',
      'redis': 'commonjs redis',
      '@grpc/grpc-js': 'commonjs @grpc/grpc-js',
      '@grpc/proto-loader': 'commonjs @grpc/proto-loader',
      'grpc': 'commonjs grpc',
      // 原生模块
      'bcrypt': 'commonjs bcrypt',
      '@mapbox/node-pre-gyp': 'commonjs @mapbox/node-pre-gyp',
      'nock': 'commonjs nock',
      'aws-sdk': 'commonjs aws-sdk',
      'fsevents': 'commonjs fsevents'
    }
  ],
  plugins: [
    new webpack.IgnorePlugin({
      checkResource(resource) {
        const lazyImports = [
          '@nestjs/microservices',
          '@nestjs/microservices/microservices-module',
          'ioredis',
          'amqplib',
          'amqp-connection-manager',
          'nats',
          'mqtt',
          'kafkajs',
          'redis',
          'cache-manager',
          '@grpc/grpc-js',
          '@grpc/proto-loader',
          'grpc',
          'protobufjs',
          '@grpc/reflection'
        ];
        if (!lazyImports.includes(resource)) {
          return false;
        }
        try {
          require.resolve(resource, {
            paths: [process.cwd()],
          });
        } catch (err) {
          return true;
        }
        return false;
      },
    }),
  ],
  watch: process.env.NODE_ENV !== 'production',
  watchOptions: {
    ignored: /node_modules/,
    poll: 1000,
  },
};
