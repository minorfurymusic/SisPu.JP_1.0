from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QTableWidget, QTableWidgetItem,
    QLineEdit, QLabel, QMessageBox, QSpinBox
)
from sispubint.repositories import SecretariasRepository, RepositoryError


class SecretariasPage(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.repo = SecretariasRepository()
        self.codigo = QSpinBox()
        self.codigo.setRange(0, 999999)
        self.codigo.setSpecialValueText("sem código legado")
        self.nome = QLineEdit()
        self.nome.setPlaceholderText("Nome da secretaria")
        self.tabela = QTableWidget(0, 4)
        self.tabela.setHorizontalHeaderLabels(["ID", "Código legado", "Nome", "Ativo"])
        self._montar_layout()
        self.carregar()

    def _montar_layout(self) -> None:
        layout = QVBoxLayout(self)
        form = QHBoxLayout()
        form.addWidget(QLabel("Código legado:"))
        form.addWidget(self.codigo)
        form.addWidget(QLabel("Nome:"))
        form.addWidget(self.nome, 1)
        salvar = QPushButton("Salvar")
        salvar.clicked.connect(self.salvar)
        atualizar = QPushButton("Atualizar")
        atualizar.clicked.connect(self.carregar)
        form.addWidget(salvar)
        form.addWidget(atualizar)
        layout.addLayout(form)
        layout.addWidget(self.tabela)

    def carregar(self) -> None:
        try:
            registros = self.repo.listar()
        except Exception as exc:
            QMessageBox.warning(self, "Banco indisponível", str(exc))
            return
        self.tabela.setRowCount(len(registros))
        for row, item in enumerate(registros):
            valores = [item.get("id"), item.get("codigo_legado"), item.get("nome"), item.get("ativo")]
            for col, valor in enumerate(valores):
                self.tabela.setItem(row, col, QTableWidgetItem("" if valor is None else str(valor)))

    def salvar(self) -> None:
        try:
            codigo = self.codigo.value() or None
            self.repo.salvar(codigo, self.nome.text())
            self.nome.clear()
            self.codigo.setValue(0)
            self.carregar()
        except RepositoryError as exc:
            QMessageBox.information(self, "Validação", str(exc))
        except Exception as exc:
            QMessageBox.warning(self, "Erro ao salvar", str(exc))
