from PySide6.QtWidgets import QWidget, QVBoxLayout, QPushButton, QTableWidget, QTableWidgetItem, QMessageBox
from sispubint.repositories import AuditoriaRepository


class AuditoriaPage(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.repo = AuditoriaRepository()
        self.tabela = QTableWidget(0, 6)
        self.tabela.setHorizontalHeaderLabels(["ID", "Tabela", "Registro", "Ação", "Usuário", "Data/Hora"])
        layout = QVBoxLayout(self)
        atualizar = QPushButton("Atualizar auditoria")
        atualizar.clicked.connect(self.carregar)
        layout.addWidget(atualizar)
        layout.addWidget(self.tabela)
        self.carregar()

    def carregar(self) -> None:
        try:
            registros = self.repo.listar()
        except Exception as exc:
            QMessageBox.warning(self, "Banco indisponível", str(exc))
            return
        self.tabela.setRowCount(len(registros))
        for row, item in enumerate(registros):
            valores = [
                item.get("id"), item.get("tabela"), item.get("registro_pk"),
                item.get("acao"), item.get("usuario"), item.get("criado_em"),
            ]
            for col, valor in enumerate(valores):
                self.tabela.setItem(row, col, QTableWidgetItem("" if valor is None else str(valor)))
