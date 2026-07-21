(function () {
  function findOrCreate(list, name) {
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    var node = { name: name, children: [], books: [] };
    list.unshift(node);
    return node;
  }
  var withEn = findOrCreate(CR.tree, "With English translation · עם תרגום");
  var liturgy = findOrCreate(withEn.children, "Liturgy");
  var siddur = findOrCreate(liturgy.children, "Siddur");
  siddur.books.push({ id: 150001, t: "Siddur Sefard · סידור ספרד" });
  CR.titles = CR.titles.concat([[150001, "Siddur Sefard · סידור ספרד", "Liturgy / Siddur"]]);
  if (CR.ready) CR.ready();
})();
