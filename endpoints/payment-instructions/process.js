const { createHandler } = require('@app-core/server');
const parseInstruction = require('@app/services/payment-processor/parse-instruction');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],
  async handler(rc, helpers) {
    const result = await parseInstruction(rc.body);

    return {
      status:
        result.status === 'failed'
          ? helpers.http_statuses.HTTP_400_BAD_REQUEST
          : helpers.http_statuses.HTTP_200_OK,
      data: result,
    };
  },
});
