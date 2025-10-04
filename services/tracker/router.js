const client = require("./client");

module.exports.router = () => {
  const routes = [
    {
      proxy: "tracker",
      routes: [
        {
          path: "client",
          method: "GET",
          handler: client.getClient,
          public: true,
        },
      ],
    },
  ];

  return routes;
};
