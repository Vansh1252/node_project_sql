const db = require('./models');

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});

afterEach(async () => {
  const models = Object.values(db).filter(model => model?.destroy);
  for (const model of models) {
    await model.destroy({ where: {}, truncate: true });
  }
});

afterAll(async () => {
  await db.sequelize.close();
});
